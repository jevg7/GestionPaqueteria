using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Paqueteria.Api.Data;

/// <summary>
/// Columnas cuyo valor pone la base de datos (DEFAULT o trigger), no el backend.
/// </summary>
internal static class ValoresDeBaseDeDatos
{
    /// <summary>
    /// Lo asigna la BD al insertar y no cambia después (códigos de negocio, creado_en).
    /// EF no lo envía en el INSERT, lo lee con RETURNING y lanza un error si alguien lo modifica.
    /// </summary>
    public static PropertyBuilder<T> GeneradoAlInsertar<T>(this PropertyBuilder<T> propiedad)
    {
        propiedad.ValueGeneratedOnAdd();
        propiedad.Metadata.SetBeforeSaveBehavior(PropertySaveBehavior.Ignore);
        propiedad.Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);
        return propiedad;
    }

    /// <summary>
    /// Lo mantiene la BD con triggers (estado actual del paquete, fechas de recepción,
    /// actualizado_en). EF nunca lo escribe y lo relee después de cada INSERT o UPDATE
    /// de la fila. Si lo cambia un trigger de otra tabla (p. ej. el historial), hay que
    /// recargar la entidad.
    /// </summary>
    public static PropertyBuilder<T> MantenidoPorLaBd<T>(this PropertyBuilder<T> propiedad)
    {
        propiedad.ValueGeneratedOnAddOrUpdate();
        propiedad.Metadata.SetBeforeSaveBehavior(PropertySaveBehavior.Ignore);
        propiedad.Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Throw);
        return propiedad;
    }

    /// <summary>
    /// agencia_id: DEFAULT fn_agencia_actual() de la BD (variable de sesión). El código nunca la envía y
    /// RLS impide escribir en otra agencia.
    /// </summary>
    public static PropertyBuilder<long> AgenciaDeLaSesion(this PropertyBuilder<long> propiedad) =>
        propiedad.HasDefaultValueSql("paqueteria.fn_agencia_actual()").GeneradoAlInsertar();

    /// <summary>DEFAULT now() de la BD. Si el backend no asigna la fecha, la pone la BD.</summary>
    public static PropertyBuilder<T> FechaActualPorDefecto<T>(this PropertyBuilder<T> propiedad) =>
        propiedad.HasDefaultValueSql("now()");
}
