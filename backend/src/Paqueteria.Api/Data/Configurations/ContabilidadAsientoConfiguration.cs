using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public sealed class ContabilidadAsientoConfiguration : IEntityTypeConfiguration<ContabilidadAsiento>
{
    public void Configure(EntityTypeBuilder<ContabilidadAsiento> builder)
    {
        builder.ToTable("asientos_contables");
        builder.HasKey(a => a.Id).HasName("asientos_contables_pkey");
        builder.Property(a => a.AgenciaId).AgenciaDeLaSesion();
        builder.Property(a => a.Concepto).HasMaxLength(500);
        builder.Property(a => a.Referencia).HasMaxLength(100);
        builder.Property(a => a.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(a => a.CreadoXid).HasDefaultValueSql("txid_current()").GeneradoAlInsertar();
        builder.HasAlternateKey(a => new { a.Id, a.AgenciaId }).HasName("uq_asientos_contables_id_agencia");
        builder.HasOne<Agencia>().WithMany().HasForeignKey(a => a.AgenciaId).HasConstraintName("asientos_contables_agencia_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(a => new { a.RegistradoPorUsuarioId, a.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_asientos_contables_usuario");
        builder.HasOne<ContabilidadAsiento>().WithMany()
            .HasForeignKey(a => new { a.ReversionDeId, a.AgenciaId })
            .HasPrincipalKey(a => new { a.Id, a.AgenciaId })
            .IsRequired(false).HasConstraintName("fk_asientos_contables_reversion");
        builder.HasIndex(a => new { a.AgenciaId, a.ReversionDeId }).IsUnique()
            .HasFilter("reversion_de_id IS NOT NULL").HasDatabaseName("uq_asientos_contables_reversion");
        builder.HasIndex(a => new { a.AgenciaId, a.Fecha }).HasDatabaseName("ix_asientos_contables_fecha");
    }
}
