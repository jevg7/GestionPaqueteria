using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class TipoCambioConfiguration : IEntityTypeConfiguration<TipoCambio>
{
    public void Configure(EntityTypeBuilder<TipoCambio> builder)
    {
        builder.ToTable("tipos_cambio");
        builder.HasKey(t => t.Id).HasName("tipos_cambio_pkey");

        builder.Property(t => t.AgenciaId).AgenciaDeLaSesion();
        builder.Property(t => t.NioPorUsd).HasPrecision(12, 4);
        builder.Property(t => t.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(t => t.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(t => t.AgenciaId)
            .HasConstraintName("tipos_cambio_agencia_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(t => new { t.CreadoPorUsuarioId, t.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_tipos_cambio_creado_por");

        builder.HasIndex(t => new { t.AgenciaId, t.Fecha }).IsUnique().HasDatabaseName("uq_tipos_cambio_fecha");
        builder.HasIndex(t => t.CreadoPorUsuarioId).HasDatabaseName("ix_tipos_cambio_creado_por");
        // ck_tipos_cambio_valor (> 0) solo en schema.sql.
    }
}
