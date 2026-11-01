namespace Paqueteria.Api.Entities;

public enum TipoCuentaContable { Activo = 1, Pasivo, Patrimonio, Ingreso, Costo, Gasto }
public enum ClasificacionCuentaContable { Corriente = 1, NoCorriente, NoAplica }
public enum NaturalezaCuentaContable { Deudora = 1, Acreedora }

/// <summary>Cuenta de movimiento del libro mayor de una agencia. Importes expresados en NIO.</summary>
public class ContabilidadCuenta
{
    public long Id { get; set; }
    public long AgenciaId { get; private set; }
    public string Codigo { get; set; } = null!;
    public string Nombre { get; set; } = null!;
    public TipoCuentaContable Tipo { get; set; }
    public ClasificacionCuentaContable Clasificacion { get; set; }
    public NaturalezaCuentaContable Naturaleza { get; set; }
    public bool Activo { get; set; } = true;
    public DateTimeOffset CreadoEn { get; private set; }
    public DateTimeOffset ActualizadoEn { get; private set; }
}
