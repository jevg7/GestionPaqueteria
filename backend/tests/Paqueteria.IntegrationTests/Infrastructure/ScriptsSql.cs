namespace Paqueteria.IntegrationTests.Infrastructure;

/// <summary>Scripts de database/ embebidos en el ensamblado de tests.</summary>
public static class ScriptsSql
{
    public static string Seed { get; } = Leer("seed.sql");

    public static string FlujoCompleto { get; } = Leer("flujo_completo.sql");

    private static string Leer(string archivo)
    {
        var recurso = $"Paqueteria.IntegrationTests.Sql.{archivo}";
        using var stream = typeof(ScriptsSql).Assembly.GetManifestResourceStream(recurso)
            ?? throw new InvalidOperationException($"No se encontró el recurso embebido {recurso}.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
