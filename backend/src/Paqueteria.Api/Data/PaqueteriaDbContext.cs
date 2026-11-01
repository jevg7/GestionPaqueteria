using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data;

/// <summary>
/// Unidad de trabajo de la API. El esquema real lo define database/schema.sql (migración
/// Baseline); este modelo lo describe para EF y un test verifica que coincidan.
/// </summary>
/// <remarks>
/// Lo que EF no puede expresar vive solo en SQL: triggers, funciones, CHECK, la exclusión
/// de tarifas, índices por expresión, la vista y los permisos. Los valores por defecto
/// literales de la BD (true, 0, 'USD', 'ABIERTO'…) no se declaran aquí: las entidades
/// los inicializan en C# y EF siempre los envía, así un <c>false</c> explícito nunca se
/// confunde con "usar el valor por defecto".
/// </remarks>
public class PaqueteriaDbContext(DbContextOptions<PaqueteriaDbContext> options) : DbContext(options)
{
    public const string Esquema = "paqueteria";
    public const string TablaHistorialMigraciones = "__EFMigrationsHistory";

    public DbSet<Agencia> Agencias => Set<Agencia>();
    public DbSet<UsuarioPlataforma> UsuariosPlataforma => Set<UsuarioPlataforma>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Rol> Roles => Set<Rol>();
    public DbSet<UsuarioRol> UsuarioRoles => Set<UsuarioRol>();
    public DbSet<Correlativo> Correlativos => Set<Correlativo>();
    public DbSet<MetodoEnvio> MetodosEnvio => Set<MetodoEnvio>();
    public DbSet<EstadoPaqueteCatalogo> EstadosPaquete => Set<EstadoPaqueteCatalogo>();
    public DbSet<Ubicacion> Ubicaciones => Set<Ubicacion>();
    public DbSet<Ruta> Rutas => Set<Ruta>();
    public DbSet<TarifaEnvio> TarifasEnvio => Set<TarifaEnvio>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Embarque> Embarques => Set<Embarque>();
    public DbSet<Paquete> Paquetes => Set<Paquete>();
    public DbSet<HistorialEstadoPaquete> HistorialEstadosPaquete => Set<HistorialEstadoPaquete>();
    public DbSet<Factura> Facturas => Set<Factura>();
    public DbSet<DetalleFactura> DetallesFactura => Set<DetalleFactura>();
    public DbSet<Pago> Pagos => Set<Pago>();
    public DbSet<Entrega> Entregas => Set<Entrega>();
    public DbSet<FacturaSaldo> FacturasSaldo => Set<FacturaSaldo>();
    public DbSet<TipoCambio> TiposCambio => Set<TipoCambio>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ContabilidadCuenta> CuentasContables => Set<ContabilidadCuenta>();
    public DbSet<ContabilidadAsiento> AsientosContables => Set<ContabilidadAsiento>();
    public DbSet<ContabilidadPartida> PartidasContables => Set<ContabilidadPartida>();

    /// <summary>
    /// Configuración común de la API, de dotnet ef y de los tests: Npgsql, snake_case e
    /// historial de migraciones dentro del esquema <c>paqueteria</c>.
    /// </summary>
    /// <param name="connectionString">
    /// Puede ser null solo para herramientas que no se conectan (dotnet ef migrations add).
    /// </param>
    public static DbContextOptionsBuilder Configurar(DbContextOptionsBuilder options, string? connectionString)
    {
        if (connectionString is null)
        {
            options.UseNpgsql(npgsql => npgsql.MigrationsHistoryTable(TablaHistorialMigraciones, Esquema));
        }
        else
        {
            options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable(TablaHistorialMigraciones, Esquema));
        }
        return options.UseSnakeCaseNamingConvention();
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Solo existen los índices que declara schema.sql; EF no debe inventar uno por cada FK.
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();

        configurationBuilder.Properties<EstadoEmbarque>().HaveConversion<UpperSnakeEnumConverter<EstadoEmbarque>>();
        configurationBuilder.Properties<EstadoFactura>().HaveConversion<UpperSnakeEnumConverter<EstadoFactura>>();
        configurationBuilder.Properties<EstadoPagoFactura>().HaveConversion<UpperSnakeEnumConverter<EstadoPagoFactura>>();
        configurationBuilder.Properties<EstadoPago>().HaveConversion<UpperSnakeEnumConverter<EstadoPago>>();
        configurationBuilder.Properties<MetodoPago>().HaveConversion<UpperSnakeEnumConverter<MetodoPago>>();
        configurationBuilder.Properties<TipoEntrega>().HaveConversion<UpperSnakeEnumConverter<TipoEntrega>>();
        configurationBuilder.Properties<EstadoEntrega>().HaveConversion<UpperSnakeEnumConverter<EstadoEntrega>>();
        configurationBuilder.Properties<UnidadTarifa>().HaveConversion<UpperSnakeEnumConverter<UnidadTarifa>>();
        configurationBuilder.Properties<Moneda>().HaveConversion<UpperSnakeEnumConverter<Moneda>>();
        configurationBuilder.Properties<AccionAuditoria>().HaveConversion<UpperSnakeEnumConverter<AccionAuditoria>>();
        configurationBuilder.Properties<EstadoAgencia>().HaveConversion<UpperSnakeEnumConverter<EstadoAgencia>>();
        // EstadoPaquete no lleva conversor: se guarda como su id (smallint).
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Esquema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(PaqueteriaDbContext).Assembly);

        // Las FK de la BD son NO ACTION y nada se borra en cascada (no hay borrado físico).
        foreach (var fk in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()))
        {
            fk.DeleteBehavior = DeleteBehavior.NoAction;
        }
    }
}
