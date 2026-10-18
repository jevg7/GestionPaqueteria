using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>El estado del paquete cambia insertando historial; el trigger actualiza el paquete.</summary>
public class HistorialEstadoTests(ServidorPostgres servidor) : PruebaConBaseDeDatos(servidor)
{
    [Fact]
    public async Task InsertarHistorialYRecargarActualizaEstadoYFechaDeRecepcion()
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        var paquete = await CrearPaqueteAereoAsync(db, await CrearClienteAsync(db), usuario);

        db.HistorialEstadosPaquete.Add(new HistorialEstadoPaquete
        {
            PaqueteId = paquete.Id,
            EstadoId = EstadoPaquete.RecibidoEnMiami,
            UsuarioId = usuario.Id,
            Observacion = "Recibido en bodega",
        });
        await db.SaveChangesAsync(Ct);

        // EF no ve lo que el trigger hizo en otra tabla: hasta recargar, el paquete sigue igual.
        Assert.Equal(EstadoPaquete.Registrado, paquete.EstadoActualId);

        await db.Entry(paquete).ReloadAsync(Ct);

        Assert.Equal(EstadoPaquete.RecibidoEnMiami, paquete.EstadoActualId);
        Assert.NotNull(paquete.FechaRecepcionMiami);
        Assert.Null(paquete.FechaRecepcionNicaragua);
    }

    [Fact]
    public async Task ActualizarOtroCampoNoPisaElEstadoYLoRefresca()
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        var paquete = await CrearPaqueteAereoAsync(db, await CrearClienteAsync(db), usuario);
        db.HistorialEstadosPaquete.Add(new HistorialEstadoPaquete
        {
            PaqueteId = paquete.Id,
            EstadoId = EstadoPaquete.RecibidoEnMiami,
            UsuarioId = usuario.Id,
        });
        await db.SaveChangesAsync(Ct);

        // Sin recargar: la entidad tiene el estado viejo, pero EF no lo envía en el UPDATE
        // (el trigger lo rechazaría) y lo relee con RETURNING.
        paquete.Tienda = "Walmart";
        await db.SaveChangesAsync(Ct);

        Assert.Equal(EstadoPaquete.RecibidoEnMiami, paquete.EstadoActualId);
        Assert.NotNull(paquete.FechaRecepcionMiami);
    }
}
