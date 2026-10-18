using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class HistorialEstadoPaqueteConfiguration : IEntityTypeConfiguration<HistorialEstadoPaquete>
{
    public void Configure(EntityTypeBuilder<HistorialEstadoPaquete> builder)
    {
        builder.ToTable("historial_estados_paquete");
        builder.HasKey(h => h.Id).HasName("historial_estados_paquete_pkey");

        builder.Property(h => h.AgenciaId).AgenciaDeLaSesion();
        builder.Property(h => h.Fecha).FechaActualPorDefecto();

        builder.HasOne(h => h.Paquete).WithMany(p => p.Historial)
            .HasForeignKey(h => new { h.PaqueteId, h.AgenciaId })
            .HasPrincipalKey(p => new { p.Id, p.AgenciaId })
            .HasConstraintName("fk_historial_paquete");
        builder.HasOne(h => h.Estado).WithMany()
            .HasForeignKey(h => h.EstadoId)
            .HasConstraintName("historial_estados_paquete_estado_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(h => new { h.UsuarioId, h.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_historial_usuario");

        builder.HasIndex(h => new { h.PaqueteId, h.Fecha }).HasDatabaseName("ix_historial_paquete_fecha");
        builder.HasIndex(h => new { h.EstadoId, h.Fecha }).HasDatabaseName("ix_historial_estado_fecha");
        builder.HasIndex(h => h.UsuarioId).HasDatabaseName("ix_historial_usuario");
    }
}
