using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public sealed class ContabilidadPartidaConfiguration : IEntityTypeConfiguration<ContabilidadPartida>
{
    public void Configure(EntityTypeBuilder<ContabilidadPartida> builder)
    {
        builder.ToTable("partidas_contables");
        builder.HasKey(p => p.Id).HasName("partidas_contables_pkey");
        builder.Property(p => p.AgenciaId).AgenciaDeLaSesion();
        builder.Property(p => p.Debe).HasPrecision(18, 2);
        builder.Property(p => p.Haber).HasPrecision(18, 2);
        builder.Property(p => p.Detalle).HasMaxLength(300);
        builder.HasAlternateKey(p => new { p.Id, p.AgenciaId }).HasName("uq_partidas_contables_id_agencia");
        builder.HasOne<Agencia>().WithMany().HasForeignKey(p => p.AgenciaId).HasConstraintName("partidas_contables_agencia_id_fkey");
        builder.HasOne(p => p.Asiento).WithMany(a => a.Partidas)
            .HasForeignKey(p => new { p.AsientoId, p.AgenciaId })
            .HasPrincipalKey(a => new { a.Id, a.AgenciaId }).HasConstraintName("fk_partidas_contables_asiento");
        builder.HasOne(p => p.Cuenta).WithMany()
            .HasForeignKey(p => new { p.CuentaId, p.AgenciaId })
            .HasPrincipalKey(c => new { c.Id, c.AgenciaId }).HasConstraintName("fk_partidas_contables_cuenta");
        builder.HasIndex(p => p.AsientoId).HasDatabaseName("ix_partidas_contables_asiento");
        builder.HasIndex(p => p.CuentaId).HasDatabaseName("ix_partidas_contables_cuenta");
    }
}
