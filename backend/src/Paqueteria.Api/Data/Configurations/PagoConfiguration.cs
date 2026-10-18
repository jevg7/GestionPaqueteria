using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class PagoConfiguration : IEntityTypeConfiguration<Pago>
{
    public void Configure(EntityTypeBuilder<Pago> builder)
    {
        builder.ToTable("pagos");
        builder.HasKey(p => p.Id).HasName("pagos_pkey");

        builder.Property(p => p.AgenciaId).AgenciaDeLaSesion();
        builder.Property(p => p.Monto).HasPrecision(18, 2);
        // DEFAULT 'USD' solo en la BD, como los demás valores literales; su coherencia la exige ck_pagos_moneda.
        builder.Property(p => p.Moneda).HasMaxLength(3).IsFixedLength();
        builder.Property(p => p.MontoMoneda).HasPrecision(18, 2);
        builder.Property(p => p.TipoCambioAplicado).HasPrecision(12, 4);
        builder.Property(p => p.MetodoPago).HasMaxLength(20);
        builder.Property(p => p.Referencia).HasMaxLength(100);
        builder.Property(p => p.Fecha).FechaActualPorDefecto();
        builder.Property(p => p.Estado).HasMaxLength(20);
        builder.Property(p => p.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(p => p.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        // La factura se referencia junto con el cliente: el pago es del cliente de la factura.
        builder.HasOne(p => p.Factura).WithMany(f => f.Pagos)
            .HasForeignKey(p => new { p.FacturaId, p.ClienteId, p.AgenciaId })
            .HasPrincipalKey(f => new { f.Id, f.ClienteId, f.AgenciaId })
            .HasConstraintName("fk_pagos_factura_cliente");
        builder.HasOne(p => p.Cliente).WithMany()
            .HasForeignKey(p => new { p.ClienteId, p.AgenciaId })
            .HasPrincipalKey(c => new { c.Id, c.AgenciaId })
            .HasConstraintName("fk_pagos_cliente");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(p => new { p.UsuarioId, p.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_pagos_usuario");

        builder.HasIndex(p => p.FacturaId).HasDatabaseName("ix_pagos_factura");
        builder.HasIndex(p => p.ClienteId).HasDatabaseName("ix_pagos_cliente");
        builder.HasIndex(p => new { p.AgenciaId, p.Fecha }).HasDatabaseName("ix_pagos_fecha");
        builder.HasIndex(p => p.UsuarioId).HasDatabaseName("ix_pagos_usuario");
    }
}
