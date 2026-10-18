using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Paqueteria.Api.Data;

/// <summary>
/// Crea el contexto para las herramientas de EF (dotnet ef). Usa la cadena del dueño del
/// esquema, <c>ConnectionStrings:PaqueteriaOwner</c>, leída de user-secrets o de la variable
/// de entorno <c>ConnectionStrings__PaqueteriaOwner</c>. La API en ejecución nunca la usa.
/// </summary>
public class PaqueteriaDbContextFactory : IDesignTimeDbContextFactory<PaqueteriaDbContext>
{
    public PaqueteriaDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .AddUserSecrets<PaqueteriaDbContextFactory>(optional: true)
            .AddEnvironmentVariables()
            .Build();

        // Sin cadena, "migrations add" funciona igual (no se conecta); "database update" falla
        // al conectarse, que es lo esperado si no se configuró el dueño.
        var connectionString = configuration.GetConnectionString(ConnectionStringNames.Owner);

        var options = new DbContextOptionsBuilder<PaqueteriaDbContext>();
        PaqueteriaDbContext.Configurar(options, connectionString);
        return new PaqueteriaDbContext(options.Options);
    }
}
