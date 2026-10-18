using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class FacturaConfiguration : IEntityTypeConfiguration<Factura>
{
    public void Configure(EntityTypeBuilder<Factura> builder)
    {
        builder.ToTable("facturas");
        builder.HasKey(f => f.Id).HasName("facturas_pkey");

        builder.Property(f => f.AgenciaId).AgenciaDeLaSesion();
        // Correlativo sin huecos de la agencia (fn_siguiente_correlativo('FAC')), se revierte con la transacción.
        builder.Property(f => f.NumeroFactura).HasMaxLength(20).GeneradoAlInsertar();
        builder.Property(f => f.Fecha).FechaActualPorDefecto();
        builder.Property(f => f.Moneda).HasMaxLength(3).IsFixedLength();
        builder.Property(f => f.Subtotal).HasPrecision(18, 2);
        builder.Property(f => f.Descuento).HasPrecision(18, 2);
        builder.Property(f => f.Impuestos).HasPrecision(18, 2);
        builder.Property(f => f.Total).HasPrecision(18, 2);
        builder.Property(f => f.Estado).HasMaxLength(20);
        builder.Property(f => f.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(f => f.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasAlternateKey(f => new { f.Id, f.AgenciaId }).HasName("uq_facturas_id_agencia");
        // Destino de la FK compuesta de pagos: el pago es del cliente de la factura.
        builder.HasAlternateKey(f => new { f.Id, f.ClienteId, f.AgenciaId }).HasName("uq_facturas_id_cliente");

        builder.HasOne(f => f.Cliente).WithMany()
            .HasForeignKey(f => new { f.ClienteId, f.AgenciaId })
            .HasPrincipalKey(c => new { c.Id, c.AgenciaId })
            .HasConstraintName("fk_facturas_cliente");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(f => new { f.UsuarioId, f.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_facturas_usuario");

        builder.HasIndex(f => new { f.AgenciaId, f.NumeroFactura }).IsUnique().HasDatabaseName("uq_facturas_numero");
        builder.HasIndex(f => f.ClienteId).HasDatabaseName("ix_facturas_cliente");
        builder.HasIndex(f => new { f.AgenciaId, f.Fecha }).HasDatabaseName("ix_facturas_fecha");
        builder.HasIndex(f => f.UsuarioId).HasDatabaseName("ix_facturas_usuario");
    }
}
