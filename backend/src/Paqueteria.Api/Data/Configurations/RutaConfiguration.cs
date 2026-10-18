using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class RutaConfiguration : IEntityTypeConfiguration<Ruta>
{
    public void Configure(EntityTypeBuilder<Ruta> builder)
    {
        builder.ToTable("rutas");
        builder.HasKey(r => r.Id).HasName("rutas_pkey");

        builder.Property(r => r.AgenciaId).AgenciaDeLaSesion();
        builder.Property(r => r.Nombre).HasMaxLength(100);

        builder.HasAlternateKey(r => new { r.Id, r.AgenciaId }).HasName("uq_rutas_id_agencia");
        builder.HasOne(r => r.Origen).WithMany()
            .HasForeignKey(r => new { r.OrigenId, r.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_rutas_origen");
        builder.HasOne(r => r.Destino).WithMany()
            .HasForeignKey(r => new { r.DestinoId, r.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_rutas_destino");

        builder.HasIndex(r => new { r.AgenciaId, r.OrigenId, r.DestinoId }).IsUnique().HasDatabaseName("uq_rutas_origen_destino");
        builder.HasIndex(r => r.OrigenId).HasDatabaseName("ix_rutas_origen");
        builder.HasIndex(r => r.DestinoId).HasDatabaseName("ix_rutas_destino");
    }
}
