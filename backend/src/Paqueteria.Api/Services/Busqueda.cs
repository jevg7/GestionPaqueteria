namespace Paqueteria.Api.Services;

public static class Busqueda
{
    /// <summary>Carácter de escape para <c>EF.Functions.ILike(..., patron, Busqueda.Escape)</c>.</summary>
    public const string Escape = "\\";

    /// <summary>
    /// Patrón ILIKE "contiene" para lo que escribió el usuario: % y _ se buscan literales,
    /// no son comodines.
    /// </summary>
    public static string PatronContiene(string texto) =>
        $"%{texto.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";
}
