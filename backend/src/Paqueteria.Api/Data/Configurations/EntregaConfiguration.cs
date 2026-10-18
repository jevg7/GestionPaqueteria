using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class EntregaConfiguration : IEntityTypeConfiguration<Entrega>
{
    public void Configure(EntityTypeBuilder<Entrega> builder)
    {
        builder.ToTable("entregas");
        builder.HasKey(e => e.Id).HasName("entregas_pkey");

        builder.Property(e => e.AgenciaId).AgenciaDeLaSesion();
        builder.Property(e => e.TipoEntrega).HasMaxLength(20);
        builder.Property(e => e.Estado).HasMaxLength(20);
        builder.Property(e => e.PersonaRecibe).HasMaxLength(150);
        builder.Property(e => e.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(e => e.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasOne(e => e.Paquete).WithMany()
            .HasForeignKey(e => new { e.PaqueteId, e.AgenciaId })
            .HasPrincipalKey(p => new { p.Id, p.AgenciaId })
            .HasConstraintName("fk_entregas_paquete");
        builder.HasOne(e => e.Responsable).WithMany()
            .HasForeignKey(e => new { e.ResponsableUsuarioId, e.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .IsRequired(false)
            .HasConstraintName("fk_entregas_responsable");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(e => new { e.CreadoPorUsuarioId, e.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_entregas_creado_por");

        // Dos índices sobre paquete_id: van con nombre para que EF los distinga.
        builder.HasIndex(e => e.PaqueteId, "uq_entregas_paquete_vigente")
            .IsUnique()
            .HasFilter("estado NOT IN ('FALLIDA', 'CANCELADA')")
            .HasDatabaseName("uq_entregas_paquete_vigente");
        builder.HasIndex(e => e.PaqueteId, "ix_entregas_paquete").HasDatabaseName("ix_entregas_paquete");
        builder.HasIndex(e => new { e.ResponsableUsuarioId, e.Estado })
            .HasDatabaseName("ix_entregas_responsable_estado")
            .HasFilter("responsable_usuario_id IS NOT NULL");
        builder.HasIndex(e => e.CreadoPorUsuarioId).HasDatabaseName("ix_entregas_creado_por");
    }
}
