namespace Paqueteria.Api.Entities;

/// <summary>Asiento contabilizado e inmutable. Una corrección se registra mediante otro asiento.</summary>
public class ContabilidadAsiento
{
    public long Id { get; set; }
    public long AgenciaId { get; private set; }
    public DateOnly Fecha { get; set; }
    public string Concepto { get; set; } = null!;
    public string? Referencia { get; set; }
    public long? ReversionDeId { get; set; }
    public long RegistradoPorUsuarioId { get; set; }
    public DateTimeOffset CreadoEn { get; private set; }
    /// <summary>La BD solo admite partidas nuevas en la transacción que creó su cabecera.</summary>
    public long CreadoXid { get; private set; }
    public ICollection<ContabilidadPartida> Partidas { get; } = [];
}
