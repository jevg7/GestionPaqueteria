namespace Paqueteria.Api.Auth;

/// <summary>
/// Roles que pueden hacer cada operación, para <c>[Authorize(Roles = ...)]</c>.
/// Varios atributos Authorize se combinan con Y: el de la acción restringe al del controller.
/// </summary>
public static class Permisos
{
    /// <summary>BODEGA consulta clientes para asociar paquetes al recibirlos.</summary>
    public const string LeerClientes = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega;

    public const string EscribirClientes = CodigosRol.Admin + "," + CodigosRol.Agente;

    public const string LeerPaquetes = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega;

    /// <summary>Registrar lo que el cliente avisa, editar sus datos y cancelar.</summary>
    public const string GestionarPaquetes = CodigosRol.Admin + "," + CodigosRol.Agente;

    /// <summary>Recibir en Miami, pesar en Nicaragua y operar embarques (crear, asignar, salida, llegada).</summary>
    public const string OperarBodega = CodigosRol.Admin + "," + CodigosRol.Bodega;

    /// <summary>Emitir facturas, registrar pagos y consultar facturas y tipos de cambio.</summary>
    public const string Facturar = CodigosRol.Admin + "," + CodigosRol.Agente;

    /// <summary>Anular facturas y pagos, y registrar el tipo de cambio: control financiero del administrador.</summary>
    public const string AdministrarFinanzas = CodigosRol.Admin;

    /// <summary>Consultar la auditoría: contiene datos personales y financieros de todos los clientes.</summary>
    public const string VerAuditoria = CodigosRol.Admin;

    /// <summary>Marcar un paquete como listo para entrega (físicamente preparado en la agencia).</summary>
    public const string PrepararEntrega = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega;

    /// <summary>Consultar entregas. Un REPARTIDOR solo ve las asignadas a él (lo filtra EntregasService).</summary>
    public const string LeerEntregas = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega + "," + CodigosRol.Repartidor;

    /// <summary>Programar y cancelar deliveries, y registrar retiros en agencia.</summary>
    public const string ProgramarEntregas = CodigosRol.Admin + "," + CodigosRol.Agente;

    /// <summary>
    /// Salir a ruta, confirmar entregado o fallido (con cobro contra entrega). Un REPARTIDOR solo sobre
    /// sus entregas; AGENTE y ADMIN pueden hacerlo en su nombre.
    /// </summary>
    public const string OperarReparto = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Repartidor;

    /// <summary>Empleados de la agencia, sus roles e invitaciones.</summary>
    public const string AdministrarUsuarios = CodigosRol.Admin;

    /// <summary>Consultar tarifas: AGENTE cotiza al cliente y BODEGA ve con qué tarifa se pesa.</summary>
    public const string LeerTarifas = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega;

    /// <summary>Registrar y anular tarifas, y administrar ubicaciones y rutas: la configuración de la agencia.</summary>
    public const string AdministrarConfiguracion = CodigosRol.Admin;

    /// <summary>AGENTE consulta embarques para informar al cliente dónde está su paquete.</summary>
    public const string LeerEmbarques = CodigosRol.Admin + "," + CodigosRol.Agente + "," + CodigosRol.Bodega;
}
