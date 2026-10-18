using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class DetalleFacturaConfiguration : IEntityTypeConfiguration<DetalleFactura>
{
    public void Configure(EntityTypeBuilder<DetalleFactura> builder)
    {
        builder.ToTable("detalles_factura");
        builder.HasKey(d => d.Id).HasName("detalles_factura_pkey");

        builder.Property(d => d.AgenciaId).AgenciaDeLaSesion();
        builder.Property(d => d.Descripcion).HasMaxLength(200);
        builder.Property(d => d.Cantidad).HasPrecision(10, 2);
        builder.Property(d => d.PrecioUnitario).HasPrecision(12, 4);
        builder.Property(d => d.Subtotal).HasPrecision(18, 2);

        builder.HasOne(d => d.Factura).WithMany(f => f.Detalles)
            .HasForeignKey(d => new { d.FacturaId, d.AgenciaId })
            .HasPrincipalKey(f => new { f.Id, f.AgenciaId })
            .HasConstraintName("fk_detalles_factura");
        builder.HasOne(d => d.Paquete).WithMany()
            .HasForeignKey(d => new { d.PaqueteId, d.AgenciaId })
            .HasPrincipalKey(p => new { p.Id, p.AgenciaId })
            .IsRequired(false)
            .HasConstraintName("fk_detalles_paquete");

        builder.HasIndex(d => d.FacturaId).HasDatabaseName("ix_detalles_factura");
        builder.HasIndex(d => d.PaqueteId).HasDatabaseName("ix_detalles_paquete").HasFilter("paquete_id IS NOT NULL");
    }
}
