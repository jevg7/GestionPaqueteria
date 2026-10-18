namespace Paqueteria.Api.Auth;

/// <summary>
/// Claims que agrega la API después de validar el token. No vienen del token: se cargan de la BD
/// en cada solicitud, así desactivar un usuario, quitarle un rol o suspender su agencia surte efecto
/// de inmediato. Si vinieran dentro del token, se descartan.
/// </summary>
public static class ClaimsPaqueteria
{
    /// <summary>usuarios.id del empleado. Solo existe si el usuario y su agencia están activos.</summary>
    public const string UsuarioId = "paqueteria:usuario_id";

    /// <summary>Agencia del empleado: la API la fija en la sesión de la BD (RLS).</summary>
    public const string AgenciaId = "paqueteria:agencia_id";

    /// <summary>usuarios_plataforma.id de un dueño de la plataforma activo.</summary>
    public const string PlataformaId = "paqueteria:plataforma_id";

    /// <summary>
    /// Código de un rol activo del usuario (o PLATAFORMA). Es el RoleClaimType: el claim "role" de
    /// Supabase ("authenticated") no se interpreta como rol del negocio.
    /// </summary>
    public const string Rol = "paqueteria:rol";

    /// <summary>Por qué un token válido no da acceso (ver <see cref="EstadosAcceso"/>); lo usa GET /api/me.</summary>
    public const string EstadoAcceso = "paqueteria:estado_acceso";

    public static readonly string[] Todos = [UsuarioId, AgenciaId, PlataformaId, Rol, EstadoAcceso];
}

/// <summary>Motivos por los que un token válido no da acceso.</summary>
public static class EstadosAcceso
{
    public const string SinCuenta = "SIN_CUENTA";
    public const string UsuarioInactivo = "USUARIO_INACTIVO";
    public const string AgenciaSuspendida = "AGENCIA_SUSPENDIDA";
}

/// <summary>Códigos de la tabla roles, más PLATAFORMA (dueños de la plataforma, fuera de las agencias).</summary>
public static class CodigosRol
{
    public const string Admin = "ADMIN";
    public const string Agente = "AGENTE";
    public const string Bodega = "BODEGA";
    public const string Repartidor = "REPARTIDOR";
    public const string Plataforma = "PLATAFORMA";

    /// <summary>Roles que el ADMIN de una agencia puede asignar a sus empleados.</summary>
    public static readonly string[] DeAgencia = [Admin, Agente, Bodega, Repartidor];
}
