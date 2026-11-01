using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Paqueteria.Api.Auth;
using Paqueteria.Api.DTOs;
using Paqueteria.Api.Services;

namespace Paqueteria.Api.Controllers;

/// <summary>Contabilidad de la agencia en NIO. El propietario de plataforma no accede a estos libros.</summary>
[ApiController]
[Route("api/accounting")]
[Authorize(Roles = CodigosRol.Admin)]
[ProducesResponseType(StatusCodes.Status401Unauthorized)]
[ProducesResponseType(StatusCodes.Status403Forbidden)]
public sealed class AccountingController(ContabilidadService contabilidad) : ControllerBase
{
    [HttpGet("accounts")]
    public Task<IReadOnlyList<AccountingAccountResponse>> Accounts(CancellationToken ct) => contabilidad.CuentasAsync(ct);

    [HttpPost("accounts/initialize")]
    public Task<IReadOnlyList<AccountingAccountResponse>> Initialize(CancellationToken ct) => contabilidad.InicializarAsync(ct);

    [HttpPost("accounts")]
    [ProducesResponseType<AccountingAccountResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<AccountingAccountResponse>> CreateAccount(AccountingAccountRequest request, CancellationToken ct)
    {
        var cuenta = await contabilidad.CrearCuentaAsync(request, ct);
        return StatusCode(StatusCodes.Status201Created, cuenta);
    }

    [HttpPut("accounts/{id:long}")]
    public async Task<ActionResult<AccountingAccountResponse>> UpdateAccount(long id, AccountingAccountRequest request, CancellationToken ct) =>
        await contabilidad.ActualizarCuentaAsync(id, request, ct) is { } cuenta ? cuenta : NotFound();

    [HttpGet("journal")]
    public Task<PagedResponse<JournalEntryResponse>> Journal([FromQuery] JournalSearchQuery query, CancellationToken ct) => contabilidad.DiarioAsync(query, ct);

    [HttpGet("journal/{id:long}")]
    public async Task<ActionResult<JournalEntryResponse>> Entry(long id, CancellationToken ct) =>
        await contabilidad.ObtenerAsientoAsync(id, ct) is { } asiento ? asiento : NotFound();

    [HttpPost("journal")]
    [ProducesResponseType<JournalEntryResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<JournalEntryResponse>> CreateEntry(CreateJournalEntryRequest request, CancellationToken ct)
    {
        var asiento = await contabilidad.CrearAsientoAsync(request, ct);
        return CreatedAtAction(nameof(Entry), new { id = asiento.Id }, asiento);
    }

    [HttpPost("journal/{id:long}/reverse")]
    [ProducesResponseType<JournalEntryResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<JournalEntryResponse>> Reverse(long id, ReverseJournalEntryRequest request, CancellationToken ct)
    {
        var asiento = await contabilidad.RevertirAsync(id, request, ct);
        return asiento is null ? NotFound() : CreatedAtAction(nameof(Entry), new { id = asiento.Id }, asiento);
    }

    [HttpPost("expenses")]
    [ProducesResponseType<JournalEntryResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<JournalEntryResponse>> Expense(CreateAccountingExpenseRequest request, CancellationToken ct)
    {
        var asiento = await contabilidad.RegistrarGastoAsync(request, ct);
        return CreatedAtAction(nameof(Entry), new { id = asiento.Id }, asiento);
    }

    [HttpGet("balance-sheet")]
    public Task<BalanceSheetResponse> BalanceSheet([FromQuery] DateOnly? asOf, CancellationToken ct) => contabilidad.BalanceAsync(asOf, ct);

    [HttpGet("income-statement")]
    public Task<IncomeStatementResponse> IncomeStatement([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) => contabilidad.ResultadosAsync(from, to, ct);

    [HttpGet("trial-balance")]
    public Task<TrialBalanceResponse> TrialBalance([FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) => contabilidad.ComprobacionAsync(from, to, ct);
}
