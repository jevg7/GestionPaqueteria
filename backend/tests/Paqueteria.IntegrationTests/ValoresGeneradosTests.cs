using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Entities;
using Paqueteria.IntegrationTests.Infrastructure;

namespace Paqueteria.IntegrationTests;

/// <summary>EF lee de vuelta los valores que asigna la BD y no intenta escribirlos.</summary>
public class ValoresGeneradosTests(ServidorPostgres servidor) : PruebaConBaseDeDatos(servidor)
{
    [Fact]
    public async Task ClienteRecibeCodigoYFechasDeLaBd()
    {
        await using var db = NuevoContexto();

        var cliente = await CrearClienteAsync(db);

        Assert.Equal("CLI-000001", cliente.CodigoCliente);
        Assert.NotEqual(default, cliente.FechaRegistro);
        Assert.NotEqual(default, cliente.ActualizadoEn);
        Assert.True(cliente.Activo);
    }

    [Fact]
    public async Task PaqueteNaceRegistradoConCodigoEHistorialInicial()
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        var cliente = await CrearClienteAsync(db);

        var paquete = await CrearPaqueteAereoAsync(db, cliente, usuario);

        Assert.Equal("PKG-000001", paquete.CodigoPaquete);
        Assert.Equal(EstadoPaquete.Registrado, paquete.EstadoActualId);
        Assert.Null(paquete.FechaRecepcionMiami);

        await using var otra = NuevoContexto();
        var historial = await otra.HistorialEstadosPaquete.Where(h => h.PaqueteId == paquete.Id).ToListAsync(Ct);
        var inicial = Assert.Single(historial);
        Assert.Equal(EstadoPaquete.Registrado, inicial.EstadoId);
        Assert.Equal(usuario.Id, inicial.UsuarioId);
    }

    [Fact]
    public async Task EmbarqueRecibeCodigoDelTrigger()
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        var embarque = new Embarque
        {
            RutaId = await db.Rutas.Select(r => r.Id).SingleAsync(Ct),
            MetodoEnvioId = await IdMetodoAsync(db, "AEREO"),
            CreadoPorUsuarioId = usuario.Id,
        };

        db.Embarques.Add(embarque);
        await db.SaveChangesAsync(Ct);

        Assert.Matches(@"^AIR-\d{4}-0001$", embarque.CodigoEmbarque);
        Assert.Equal(EstadoEmbarque.Abierto, embarque.Estado);
    }

    [Fact]
    public async Task ModificarUnCodigoGeneradoLanzaError()
    {
        await using var db = NuevoContexto();
        var cliente = await CrearClienteAsync(db);

        db.Entry(cliente).Property(c => c.CodigoCliente).CurrentValue = "CLI-999999";

        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync(Ct));
    }

    [Fact]
    public async Task EnumSeGuardaEnUpperSnakeYSeLeeDeVuelta()
    {
        await using var db = NuevoContexto();
        var usuario = await CrearUsuarioAsync(db);
        var paquete = await CrearPaqueteAereoAsync(db, await CrearClienteAsync(db), usuario);
        var entrega = new Entrega
        {
            PaqueteId = paquete.Id,
            TipoEntrega = TipoEntrega.RetiroEnAgencia,
            CreadoPorUsuarioId = usuario.Id,
        };
        db.Entregas.Add(entrega);
        await db.SaveChangesAsync(Ct);

        var guardado = await db.Database
            .SqlQuery<string>($"select tipo_entrega || ' ' || estado as \"Value\" from paqueteria.entregas where id = {entrega.Id}")
            .SingleAsync(Ct);
        Assert.Equal("RETIRO_EN_AGENCIA PENDIENTE", guardado);

        await using var otra = NuevoContexto();
        var leida = await otra.Entregas.SingleAsync(e => e.TipoEntrega == TipoEntrega.RetiroEnAgencia, Ct);
        Assert.Equal(EstadoEntrega.Pendiente, leida.Estado);
    }
}
