using System.Data;
using Microsoft.EntityFrameworkCore;
using Paqueteria.Api.Auth;
using Paqueteria.Api.Data;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Services;

/// <summary>Libro diario de la agencia, publicado por partida doble en NIO; no mezcla facturas operativas.</summary>
public sealed class ContabilidadService(PaqueteriaDbContext db, UsuarioActual usuarioActual, TimeProvider reloj)
{
    public async Task<IReadOnlyList<AccountingAccountResponse>> CuentasAsync(CancellationToken ct) =>
        (await db.Set<ContabilidadCuenta>().AsNoTracking().OrderBy(c => c.Codigo).ToListAsync(ct)).Select(ACuenta).ToList();

    /// <summary>Agrega las cuentas base que falten sin reemplazar las personalizadas ni sus nombres.</summary>
    public async Task<IReadOnlyList<AccountingAccountResponse>> InicializarAsync(CancellationToken ct)
    {
        await using var transaccion = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync(
            "select pg_advisory_xact_lock(hashtextextended('contabilidad:' || paqueteria.fn_agencia_actual()::text, 0))", ct);
        var codigos = (await db.Set<ContabilidadCuenta>().Select(c => c.Codigo).ToListAsync(ct)).ToHashSet(StringComparer.Ordinal);
        db.Set<ContabilidadCuenta>().AddRange(PlanInicial().Where(c => !codigos.Contains(c.Codigo)));
        await db.SaveChangesAsync(ct);
        await transaccion.CommitAsync(ct);
        return await CuentasAsync(ct);
    }

    public async Task<AccountingAccountResponse> CrearCuentaAsync(AccountingAccountRequest datos, CancellationToken ct)
    {
        CalculosContables.ValidarCuenta(datos);
        var codigo = datos.Codigo.Trim().ToUpperInvariant();
        if (await db.Set<ContabilidadCuenta>().AnyAsync(c => c.Codigo == codigo, ct))
            throw new ConflictoException("Ya existe una cuenta con ese código.");
        var cuenta = new ContabilidadCuenta();
        Aplicar(cuenta, datos);
        db.Set<ContabilidadCuenta>().Add(cuenta);
        await db.SaveChangesAsync(ct);
        return ACuenta(cuenta);
    }

    public async Task<AccountingAccountResponse?> ActualizarCuentaAsync(long id, AccountingAccountRequest datos, CancellationToken ct)
    {
        CalculosContables.ValidarCuenta(datos);
        await using var transaccion = await db.Database.BeginTransactionAsync(ct);
        var cuenta = await db.Set<ContabilidadCuenta>()
            .FromSql($"select * from paqueteria.cuentas_contables where id = {id} for update").SingleOrDefaultAsync(ct);
        if (cuenta is null) return null;
        var codigo = datos.Codigo.Trim().ToUpperInvariant();
        var cambiaClasificacion = cuenta.Codigo != codigo || cuenta.Tipo != datos.Tipo ||
            cuenta.Clasificacion != datos.Clasificacion || cuenta.Naturaleza != datos.Naturaleza;
        if (cambiaClasificacion && await db.Set<ContabilidadPartida>().AnyAsync(p => p.CuentaId == id, ct))
            throw new ConflictoException("Una cuenta con movimientos conserva su código, tipo, clasificación y naturaleza. Puede renombrarla o desactivarla.");
        if (await db.Set<ContabilidadCuenta>().AnyAsync(c => c.Id != id && c.Codigo == codigo, ct))
            throw new ConflictoException("Ya existe una cuenta con ese código.");
        Aplicar(cuenta, datos);
        await db.SaveChangesAsync(ct);
        await transaccion.CommitAsync(ct);
        return ACuenta(cuenta);
    }

    public async Task<PagedResponse<JournalEntryResponse>> DiarioAsync(JournalSearchQuery filtro, CancellationToken ct)
    {
        if (filtro.Desde.HasValue && filtro.Hasta.HasValue) ValidarRango(filtro.Desde.Value, filtro.Hasta.Value);
        var consulta = db.Set<ContabilidadAsiento>().AsNoTracking().AsQueryable();
        if (filtro.Desde.HasValue) consulta = consulta.Where(a => a.Fecha >= filtro.Desde.Value);
        if (filtro.Hasta.HasValue) consulta = consulta.Where(a => a.Fecha <= filtro.Hasta.Value);
        if (!string.IsNullOrWhiteSpace(filtro.Search))
        {
            var patron = "%" + filtro.Search.Trim() + "%";
            consulta = consulta.Where(a => EF.Functions.ILike(a.Concepto, patron) ||
                (a.Referencia != null && EF.Functions.ILike(a.Referencia, patron)));
        }
        var total = await consulta.CountAsync(ct);
        var asientos = await consulta.OrderByDescending(a => a.Fecha).ThenByDescending(a => a.Id)
            .Skip((filtro.Page - 1) * filtro.PageSize).Take(filtro.PageSize)
            .Include(a => a.Partidas).ThenInclude(p => p.Cuenta).AsSplitQuery().ToListAsync(ct);
        var ids = asientos.Select(a => a.Id).ToArray();
        var reversiones = await db.Set<ContabilidadAsiento>().AsNoTracking()
            .Where(a => a.ReversionDeId.HasValue && ids.Contains(a.ReversionDeId.Value))
            .ToDictionaryAsync(a => a.ReversionDeId!.Value, a => a.Id, ct);
        return new(asientos.Select(a => AAsiento(a, reversiones.GetValueOrDefault(a.Id) is var reversa && reversa != 0 ? reversa : null)).ToList(),
            filtro.Page, filtro.PageSize, total);
    }

    public async Task<JournalEntryResponse?> ObtenerAsientoAsync(long id, CancellationToken ct)
    {
        var asiento = await db.Set<ContabilidadAsiento>().AsNoTracking()
            .Include(a => a.Partidas).ThenInclude(p => p.Cuenta).AsSplitQuery().SingleOrDefaultAsync(a => a.Id == id, ct);
        if (asiento is null) return null;
        var revertidoPor = await db.Set<ContabilidadAsiento>().AsNoTracking()
            .Where(a => a.ReversionDeId == id).Select(a => (long?)a.Id).SingleOrDefaultAsync(ct);
        return AAsiento(asiento, revertidoPor);
    }

    public Task<JournalEntryResponse> CrearAsientoAsync(CreateJournalEntryRequest datos, CancellationToken ct) =>
        RegistrarAsync(datos, ct);

    public Task<JournalEntryResponse> RegistrarGastoAsync(CreateAccountingExpenseRequest datos, CancellationToken ct) =>
        RegistrarAsync(new(datos.Fecha, datos.Concepto, datos.Referencia,
            [new(datos.CuentaGastoId, datos.Monto, 0), new(datos.ContrapartidaId, 0, datos.Monto)]),
            ct, datos.CuentaGastoId, datos.ContrapartidaId);

    private async Task<JournalEntryResponse> RegistrarAsync(CreateJournalEntryRequest datos, CancellationToken ct,
        long? gastoId = null, long? contrapartidaId = null)
    {
        ValidarFecha(datos.Fecha);
        CalculosContables.ValidarPartidas(datos.Partidas);
        await using var transaccion = await db.Database.BeginTransactionAsync(ct);
        var ids = datos.Partidas.Select(p => p.CuentaId).Distinct().Order().ToArray();
        // El bloqueo evita cambiar la clasificación o desactivar cuentas mientras se publica el asiento.
        var cuentas = await db.Set<ContabilidadCuenta>()
            .FromSql($"select * from paqueteria.cuentas_contables where id = any({ids}) order by id for share").ToListAsync(ct);
        if (cuentas.Count != ids.Length || cuentas.Any(c => !c.Activo))
            throw new SolicitudInvalidaException("Todas las partidas deben usar cuentas activas de esta agencia.");
        var porId = cuentas.ToDictionary(c => c.Id);
        if (gastoId.HasValue)
        {
            var gasto = porId[gastoId.Value];
            var contraparte = porId[contrapartidaId!.Value];
            if (gasto.Tipo is not (TipoCuentaContable.Gasto or TipoCuentaContable.Costo) || gasto.Naturaleza != NaturalezaCuentaContable.Deudora ||
                contraparte.Tipo is not (TipoCuentaContable.Activo or TipoCuentaContable.Pasivo))
                throw new SolicitudInvalidaException("El gasto usa una cuenta de costo/gasto deudora y una contrapartida de activo o pasivo.");
        }
        var asiento = new ContabilidadAsiento
        {
            Fecha = datos.Fecha, Concepto = datos.Concepto.Trim(), Referencia = TextoOpcional(datos.Referencia),
            RegistradoPorUsuarioId = usuarioActual.Id,
        };
        foreach (var partida in datos.Partidas)
            asiento.Partidas.Add(new() { CuentaId = partida.CuentaId, Cuenta = porId[partida.CuentaId], Debe = partida.Debe,
                Haber = partida.Haber, Detalle = TextoOpcional(partida.Detalle) });
        db.Set<ContabilidadAsiento>().Add(asiento);
        await db.SaveChangesAsync(ct);
        await transaccion.CommitAsync(ct);
        return AAsiento(asiento, null);
    }

    public async Task<JournalEntryResponse?> RevertirAsync(long id, ReverseJournalEntryRequest datos, CancellationToken ct)
    {
        ValidarFecha(datos.Fecha);
        await using var transaccion = await db.Database.BeginTransactionAsync(ct);
        var original = await db.Set<ContabilidadAsiento>()
            .FromSql($"select * from paqueteria.asientos_contables where id = {id} for update").AsNoTracking().SingleOrDefaultAsync(ct);
        if (original is null) return null;
        if (original.ReversionDeId.HasValue) throw new ConflictoException("Un contraasiento de reversión no se vuelve a revertir. Registre un nuevo asiento si necesita otra corrección.");
        if (await db.Set<ContabilidadAsiento>().AnyAsync(a => a.ReversionDeId == id, ct))
            throw new ConflictoException("El asiento ya tiene un contraasiento de reversión.");
        if (datos.Fecha < original.Fecha) throw new SolicitudInvalidaException("La reversión no puede tener fecha anterior al asiento original.");
        var partidas = await db.Set<ContabilidadPartida>().AsNoTracking().Include(p => p.Cuenta)
            .Where(p => p.AsientoId == id).OrderBy(p => p.Id).ToListAsync(ct);
        var reversa = new ContabilidadAsiento
        {
            Fecha = datos.Fecha, Concepto = $"Reversión del asiento {id}: {datos.Motivo.Trim()}",
            Referencia = original.Referencia, ReversionDeId = id, RegistradoPorUsuarioId = usuarioActual.Id,
        };
        // Una reversión exacta puede usar las cuentas originales aunque se hayan desactivado.
        foreach (var partida in partidas)
            reversa.Partidas.Add(new() { CuentaId = partida.CuentaId, Debe = partida.Haber, Haber = partida.Debe, Detalle = partida.Detalle });
        db.Set<ContabilidadAsiento>().Add(reversa);
        await db.SaveChangesAsync(ct);
        await transaccion.CommitAsync(ct);
        foreach (var partida in reversa.Partidas) partida.Cuenta = partidas.First(p => p.CuentaId == partida.CuentaId).Cuenta;
        return AAsiento(reversa, null);
    }

    public async Task<BalanceSheetResponse> BalanceAsync(DateOnly? fecha, CancellationToken ct)
    {
        var corte = fecha ?? Hoy();
        if (corte == default) throw new SolicitudInvalidaException("Seleccione una fecha de corte válida.");
        var (cuentas, saldos) = await DatosReporteAsync(DateOnly.MinValue, corte, ct);
        return CalculosContables.Balance(cuentas, saldos, corte);
    }

    public async Task<IncomeStatementResponse> ResultadosAsync(DateOnly? desde, DateOnly? hasta, CancellationToken ct)
    {
        var (inicio, fin) = Periodo(desde, hasta);
        var (cuentas, saldos) = await DatosReporteAsync(inicio, fin, ct);
        return CalculosContables.Resultados(cuentas, saldos, inicio, fin);
    }

    public async Task<TrialBalanceResponse> ComprobacionAsync(DateOnly? desde, DateOnly? hasta, CancellationToken ct)
    {
        var (inicio, fin) = Periodo(desde, hasta);
        var (cuentas, saldos) = await DatosReporteAsync(inicio, fin, ct);
        return CalculosContables.Comprobacion(cuentas, saldos, inicio, fin);
    }

    private async Task<(IReadOnlyList<ContabilidadCuenta> Cuentas, IReadOnlyList<SaldoContable> Saldos)> DatosReporteAsync(
        DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        // Catálogo y movimientos comparten la misma foto: una cuenta y su primer
        // asiento publicados concurrentemente no pueden aparecer por separado.
        await using var transaccion = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        await db.Database.ExecuteSqlRawAsync("set transaction read only", ct);
        var cuentas = await db.Set<ContabilidadCuenta>().AsNoTracking().ToListAsync(ct);
        var saldos = await SaldosAsync(desde, hasta, ct);
        await transaccion.CommitAsync(ct);
        return (cuentas, saldos);
    }

    private async Task<IReadOnlyList<SaldoContable>> SaldosAsync(DateOnly desde, DateOnly hasta, CancellationToken ct) =>
        await db.Set<ContabilidadPartida>().AsNoTracking().Where(p => p.Asiento.Fecha <= hasta)
            .GroupBy(p => p.CuentaId).Select(g => new SaldoContable(g.Key,
                g.Sum(p => p.Asiento.Fecha < desde ? p.Debe - p.Haber : 0),
                g.Sum(p => p.Asiento.Fecha >= desde ? p.Debe : 0),
                g.Sum(p => p.Asiento.Fecha >= desde ? p.Haber : 0))).ToListAsync(ct);

    private (DateOnly Desde, DateOnly Hasta) Periodo(DateOnly? desde, DateOnly? hasta)
    {
        var fin = hasta ?? Hoy();
        var inicio = desde ?? new DateOnly(fin.Year, 1, 1);
        ValidarRango(inicio, fin);
        return (inicio, fin);
    }

    private static void ValidarRango(DateOnly desde, DateOnly hasta)
    {
        if (desde == default || hasta == default || desde > hasta)
            throw new SolicitudInvalidaException("El rango de fechas no es válido: desde debe ser anterior o igual a hasta.");
    }

    private void ValidarFecha(DateOnly fecha)
    {
        if (fecha == default || fecha > Hoy())
            throw new SolicitudInvalidaException("La fecha contable es obligatoria y no puede ser futura (hora de Managua).");
    }

    private DateOnly Hoy() => CalculoMonto.FechaEnManagua(reloj.GetUtcNow());
    private static string? TextoOpcional(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();
    private static AccountingAccountResponse ACuenta(ContabilidadCuenta c) => new(c.Id, c.Codigo, c.Nombre, c.Tipo, c.Clasificacion, c.Naturaleza, c.Activo);
    private static void Aplicar(ContabilidadCuenta cuenta, AccountingAccountRequest datos)
    {
        cuenta.Codigo = datos.Codigo.Trim().ToUpperInvariant(); cuenta.Nombre = datos.Nombre.Trim(); cuenta.Tipo = datos.Tipo;
        cuenta.Clasificacion = datos.Clasificacion; cuenta.Naturaleza = datos.Naturaleza; cuenta.Activo = datos.Activo;
    }

    private static JournalEntryResponse AAsiento(ContabilidadAsiento a, long? revertidoPor) => new(a.Id, a.Fecha, a.Concepto, a.Referencia,
        a.ReversionDeId, revertidoPor, a.RegistradoPorUsuarioId, a.CreadoEn, a.Partidas.Sum(p => p.Debe), a.Partidas.Sum(p => p.Haber),
        a.Partidas.OrderBy(p => p.Id).Select(p => new JournalLineResponse(p.CuentaId, p.Cuenta.Codigo, p.Cuenta.Nombre, p.Debe, p.Haber, p.Detalle)).ToList());

    private static IReadOnlyList<ContabilidadCuenta> PlanInicial()
    {
        static ContabilidadCuenta Cuenta(string codigo, string nombre, TipoCuentaContable tipo,
            ClasificacionCuentaContable clasificacion = ClasificacionCuentaContable.NoAplica,
            NaturalezaCuentaContable? naturaleza = null) => new()
            {
                Codigo = codigo, Nombre = nombre, Tipo = tipo, Clasificacion = clasificacion,
                Naturaleza = naturaleza ?? (tipo is TipoCuentaContable.Activo or TipoCuentaContable.Costo or TipoCuentaContable.Gasto
                    ? NaturalezaCuentaContable.Deudora : NaturalezaCuentaContable.Acreedora),
            };
        return [
            Cuenta("1101", "Caja", TipoCuentaContable.Activo, ClasificacionCuentaContable.Corriente),
            Cuenta("1102", "Bancos", TipoCuentaContable.Activo, ClasificacionCuentaContable.Corriente),
            Cuenta("1103", "Cuentas por cobrar", TipoCuentaContable.Activo, ClasificacionCuentaContable.Corriente),
            Cuenta("1104", "Anticipos y pagos por adelantado", TipoCuentaContable.Activo, ClasificacionCuentaContable.Corriente),
            Cuenta("1201", "Equipo y mobiliario", TipoCuentaContable.Activo, ClasificacionCuentaContable.NoCorriente),
            Cuenta("1202", "Depreciación acumulada", TipoCuentaContable.Activo, ClasificacionCuentaContable.NoCorriente, NaturalezaCuentaContable.Acreedora),
            Cuenta("2101", "Cuentas por pagar", TipoCuentaContable.Pasivo, ClasificacionCuentaContable.Corriente),
            Cuenta("2102", "Préstamos a corto plazo", TipoCuentaContable.Pasivo, ClasificacionCuentaContable.Corriente),
            Cuenta("2201", "Préstamos a largo plazo", TipoCuentaContable.Pasivo, ClasificacionCuentaContable.NoCorriente),
            Cuenta("3101", "Capital aportado", TipoCuentaContable.Patrimonio),
            Cuenta("3102", "Resultados acumulados", TipoCuentaContable.Patrimonio),
            Cuenta("4101", "Ingresos por envíos", TipoCuentaContable.Ingreso),
            Cuenta("4102", "Otros ingresos", TipoCuentaContable.Ingreso),
            Cuenta("5101", "Costos de transporte", TipoCuentaContable.Costo),
            Cuenta("6101", "Alquiler", TipoCuentaContable.Gasto),
            Cuenta("6102", "Servicios básicos", TipoCuentaContable.Gasto),
            Cuenta("6103", "Sueldos y salarios", TipoCuentaContable.Gasto),
            Cuenta("6104", "Combustible", TipoCuentaContable.Gasto),
            Cuenta("6105", "Suministros", TipoCuentaContable.Gasto),
            Cuenta("6106", "Depreciación", TipoCuentaContable.Gasto),
            Cuenta("6199", "Otros gastos", TipoCuentaContable.Gasto),
        ];
    }
}
