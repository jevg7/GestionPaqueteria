namespace Paqueteria.Api.Data;

/// <summary>
/// Nombres de las cadenas de conexión (sección ConnectionStrings). Nunca van en el
/// repositorio: se leen de user-secrets en desarrollo y de variables de entorno en
/// despliegue (<c>ConnectionStrings__Paqueteria</c>, <c>ConnectionStrings__PaqueteriaOwner</c>).
/// </summary>
public static class ConnectionStringNames
{
    /// <summary>La API en ejecución: usuario de login miembro de <c>paqueteria_api</c>.</summary>
    public const string Api = "Paqueteria";

    /// <summary>Dueño del esquema. Solo para aplicar migraciones (dotnet ef / despliegue).</summary>
    public const string Owner = "PaqueteriaOwner";
}
