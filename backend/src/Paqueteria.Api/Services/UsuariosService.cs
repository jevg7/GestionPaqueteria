using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;
using Paqueteria.Api.Middleware;

namespace Paqueteria.Api.Services;

/// <summary>
/// Empleados de la agencia, administrados por su ADMIN desde el frontend. El alta invita por correo
/// (Supabase Auth). No hay borrado: un usuario se desactiva y pierde el acceso en su siguiente solicitud.
/// La agencia siempre conserva al menos un ADMIN activo, y nadie se desactiva ni se quita el rol ADMIN
/// a sí mismo.
/// </summary>
public sealed class UsuariosService(
    PaqueteriaDbContext db, UsuarioActual usuarioActual, InvitacionesSupabase invitaciones, ILogger<UsuariosService> logger)
{
    private static readonly Expression<Func<Usuario, UserResponse>> AResponse = u => new UserResponse(
        u.Id, u.Nombres, u.Apellidos, u.Correo, u.Telefono, u.Activo,
        u.Roles.Select(r => r.Rol.Codigo).OrderBy(c => c).ToList(),
        u.CreadoEn, u.ActualizadoEn);

    public Task<List<RoleResponse>> RolesAsync(CancellationToken cancellationToken) =>
        db.Roles.AsNoTracking()
            .Where(r => r.Activo && CodigosRol.DeAgencia.Contains(r.Codigo))
            .OrderBy(r => r.Id)
            .Select(r => new RoleResponse(r.Codigo, r.Nombre, r.Descripcion))
            .ToListAsync(cancellationToken);

    public async Task<PagedResponse<UserResponse>> BuscarAsync(UserSearchQuery filtro, CancellationToken cancellationToken)
    {
        var consulta = db.Usuarios.AsNoTracking();

        if (filtro.Activo is { } activo)
        {
            consulta = consulta.Where(u => u.Activo == activo);
        }
        if (!string.IsNullOrWhiteSpace(filtro.Rol))
        {
            var rol = filtro.Rol.Trim().ToUpperInvariant();
            consulta = consulta.Where(u => u.Roles.Any(r => r.Rol.Codigo == rol));
        }
        var termino = filtro.Search?.Trim();
        if (!string.IsNullOrEmpty(termino))
        {
            var patron = Busqueda.PatronContiene(termino);
            consulta = consulta.Where(u =>
                EF.Functions.ILike(u.Nombres + " " + u.Apellidos, patron, Busqueda.Escape) ||
                EF.Functions.ILike(u.Correo, patron, Busqueda.Escape));
        }

        var total = await consulta.CountAsync(cancellationToken);
        var items = await consulta
            .OrderBy(u => u.Apellidos).ThenBy(u => u.Nombres).ThenBy(u => u.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize)
            .Take(filtro.PageSize)
            .Select(AResponse)
            .ToListAsync(cancellationToken);

        return new PagedResponse<UserResponse>(items, filtro.Page, filtro.PageSize, total);
    }

    public Task<UserResponse?> ObtenerAsync(long id, CancellationToken cancellationToken) =>
        db.Usuarios.AsNoTracking().Where(u => u.Id == id).Select(AResponse).SingleOrDefaultAsync(cancellationToken);

    public async Task<UserResponse> CrearAsync(CreateUserRequest datos, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        var usuario = await AltaConInvitacionAsync(datos, cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Usuario {UsuarioId} invitado por el usuario {AdminId}.", usuario.Id, usuarioActual.Id);
        return (await ObtenerAsync(usuario.Id, cancellationToken))!;
    }

    /// <summary>
    /// Crea el usuario con sus roles en la agencia de la sesión y lo invita. Requiere una transacción
    /// abierta: si la invitación falla, el usuario no queda creado. La usa también el alta de agencias.
    /// </summary>
    public async Task<Usuario> AltaConInvitacionAsync(CreateUserRequest datos, CancellationToken cancellationToken)
    {
        var roles = await ResolverRolesAsync(datos.Roles, cancellationToken);
        var correo = datos.Correo.Trim().ToLowerInvariant();
        var usuario = new Usuario
        {
            Nombres = datos.Nombres.Trim(),
            Apellidos = datos.Apellidos.Trim(),
            Correo = correo,
            Telefono = Opcional(datos.Telefono),
        };
        foreach (var rol in roles)
        {
            usuario.Roles.Add(new UsuarioRol { RolId = rol.Id });
        }
        db.Usuarios.Add(usuario);
        // Primero el INSERT: un correo repetido se rechaza sin enviar la invitación.
        await GuardarAsync(cancellationToken);

        usuario.AuthUserId = await invitaciones.InvitarAsync(correo, cancellationToken);
        await GuardarAsync(cancellationToken);
        return usuario;
    }

    /// <summary>Reemplaza nombres, teléfono y roles. Null si el usuario no existe.</summary>
    public async Task<UserResponse?> ActualizarAsync(long id, UpdateUserRequest datos, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        await BloquearAgenciaAsync(cancellationToken);
        var usuario = await db.Usuarios.Include(u => u.Roles).ThenInclude(r => r.Rol)
            .SingleOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (usuario is null)
        {
            return null;
        }

        var nuevos = await ResolverRolesAsync(datos.Roles, cancellationToken);
        if (EsAdmin(usuario) && nuevos.All(r => r.Codigo != CodigosRol.Admin))
        {
            if (usuario.Id == usuarioActual.Id)
            {
                throw new ConflictoException("No puede quitarse su propio rol ADMIN. Pídaselo a otro administrador.");
            }
            if (usuario.Activo)
            {
                await VerificarOtroAdminActivoAsync(usuario.Id, cancellationToken);
            }
        }

        usuario.Nombres = datos.Nombres.Trim();
        usuario.Apellidos = datos.Apellidos.Trim();
        usuario.Telefono = Opcional(datos.Telefono);
        foreach (var quitado in usuario.Roles.Where(r => nuevos.All(n => n.Id != r.RolId)).ToList())
        {
            db.UsuarioRoles.Remove(quitado);
        }
        foreach (var agregado in nuevos.Where(n => usuario.Roles.All(r => r.RolId != n.Id)))
        {
            usuario.Roles.Add(new UsuarioRol { RolId = agregado.Id });
        }
        await GuardarAsync(cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Usuario {UsuarioId} actualizado por el usuario {AdminId}. Roles: {Roles}.",
            usuario.Id, usuarioActual.Id, string.Join(",", nuevos.Select(r => r.Codigo)));
        return await ObtenerAsync(usuario.Id, cancellationToken);
    }

    /// <summary>Activa o desactiva. Es idempotente. False si el usuario no existe.</summary>
    public async Task<bool> CambiarActivoAsync(long id, bool activo, CancellationToken cancellationToken)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(cancellationToken);
        await BloquearAgenciaAsync(cancellationToken);
        var usuario = await db.Usuarios.Include(u => u.Roles).ThenInclude(r => r.Rol)
            .SingleOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (usuario is null)
        {
            return false;
        }
        if (usuario.Activo == activo)
        {
            return true;
        }

        if (!activo)
        {
            if (usuario.Id == usuarioActual.Id)
            {
                throw new ConflictoException("No puede desactivar su propio usuario.");
            }
            if (EsAdmin(usuario))
            {
                await VerificarOtroAdminActivoAsync(usuario.Id, cancellationToken);
            }
        }

        usuario.Activo = activo;
        await db.SaveChangesAsync(cancellationToken);
        await transaccion.CommitAsync(cancellationToken);

        logger.LogInformation("Usuario {UsuarioId} {Accion} por el usuario {AdminId}.",
            usuario.Id, activo ? "reactivado" : "desactivado", usuarioActual.Id);
        return true;
    }

    /// <summary>
    /// Vuelve a enviar la invitación (el enlace vence). Si ya la aceptó, responde 409: para recuperar
    /// el acceso se usa "olvidé mi contraseña". False si el usuario no existe.
    /// </summary>
    public async Task<bool> ReenviarInvitacionAsync(long id, CancellationToken cancellationToken)
    {
        var usuario = await db.Usuarios.SingleOrDefaultAsync(u => u.Id == id, cancellationToken);
        if (usuario is null)
        {
            return false;
        }
        if (!usuario.Activo)
        {
            throw new ConflictoException("El usuario está desactivado. Actívelo antes de reenviar la invitación.");
        }

        var authUserId = await invitaciones.InvitarAsync(usuario.Correo, cancellationToken);
        if (usuario.AuthUserId != authUserId)
        {
            // La cuenta de Supabase se eliminó y la invitación creó otra: se vincula la nueva.
            if (usuario.AuthUserId is not null)
            {
                logger.LogWarning("La cuenta de acceso del usuario {UsuarioId} cambió al reenviar la invitación.", usuario.Id);
            }
            usuario.AuthUserId = authUserId;
            await GuardarAsync(cancellationToken);
        }

        logger.LogInformation("Invitación del usuario {UsuarioId} reenviada por el usuario {AdminId}.", usuario.Id, usuarioActual.Id);
        return true;
    }

    private async Task<List<Rol>> ResolverRolesAsync(IReadOnlyList<string> codigos, CancellationToken cancellationToken)
    {
        var pedidos = codigos.Select(c => c.Trim().ToUpperInvariant()).Distinct().ToList();
        var roles = await db.Roles
            .Where(r => r.Activo && pedidos.Contains(r.Codigo) && CodigosRol.DeAgencia.Contains(r.Codigo))
            .ToListAsync(cancellationToken);
        if (pedidos.FirstOrDefault(p => roles.All(r => r.Codigo != p)) is { } desconocido)
        {
            throw new SolicitudInvalidaException(
                $"El rol {desconocido} no existe. Roles válidos: {string.Join(", ", CodigosRol.DeAgencia)}.");
        }
        return roles;
    }

    private static bool EsAdmin(Usuario usuario) => usuario.Roles.Any(r => r.Rol.Codigo == CodigosRol.Admin);

    /// <summary>
    /// Serializa los cambios de usuarios de la agencia: sin esto, dos ADMIN que se desactivan entre sí
    /// al mismo tiempo dejarían la agencia sin administrador. NO KEY UPDATE no bloquea los INSERT que
    /// referencian la agencia.
    /// </summary>
    private Task BloquearAgenciaAsync(CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlAsync(
            $"select 1 from paqueteria.agencias where id = {usuarioActual.AgenciaId} for no key update", cancellationToken);

    private async Task VerificarOtroAdminActivoAsync(long usuarioId, CancellationToken cancellationToken)
    {
        var hayOtro = await db.Usuarios.AnyAsync(u => u.Id != usuarioId && u.Activo &&
            u.Roles.Any(r => r.Rol.Codigo == CodigosRol.Admin && r.Rol.Activo), cancellationToken);
        if (!hayOtro)
        {
            throw new ConflictoException("La agencia debe conservar al menos un ADMIN activo.");
        }
    }

    private async Task GuardarAsync(CancellationToken cancellationToken)
    {
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        // uq_usuarios_correo es global: el correo identifica a la persona en toda la plataforma.
        catch (DbUpdateException ex) when (Unico(ex) == "uq_usuarios_correo")
        {
            throw new ConflictoException("Ya existe un usuario con ese correo en la plataforma.");
        }
        catch (DbUpdateException ex) when (Unico(ex) == "usuarios_auth_user_id_key")
        {
            throw new ConflictoException("La cuenta de acceso de ese correo ya está vinculada a otro usuario.");
        }
    }

    private static string? Unico(DbUpdateException ex) =>
        PostgresExceptionMapper.Find(ex) is { SqlState: PostgresErrorCodes.UniqueViolation } unico ? unico.ConstraintName : null;

    private static string? Opcional(string? valor) => string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();
}
