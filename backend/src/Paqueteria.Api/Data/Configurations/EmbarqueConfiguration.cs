using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class EmbarqueConfiguration : IEntityTypeConfiguration<Embarque>
{
    public void Configure(EntityTypeBuilder<Embarque> builder)
    {
        builder.ToTable("embarques");
        builder.HasKey(e => e.Id).HasName("embarques_pkey");

        builder.Property(e => e.AgenciaId).AgenciaDeLaSesion();
        // Lo asigna el trigger trg_embarques_asignar_codigo (correlativo de la agencia).
        builder.Property(e => e.CodigoEmbarque).HasMaxLength(20).GeneradoAlInsertar();
        builder.Property(e => e.Estado).HasMaxLength(20);
        builder.Property(e => e.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(e => e.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        // Destino de la FK compuesta de paquetes: un paquete solo entra a un embarque de su mismo
        // método de envío y de su agencia.
        builder.HasAlternateKey(e => new { e.Id, e.MetodoEnvioId, e.AgenciaId }).HasName("uq_embarques_id_metodo");

        builder.HasOne(e => e.Ruta).WithMany()
            .HasForeignKey(e => new { e.RutaId, e.AgenciaId })
            .HasPrincipalKey(r => new { r.Id, r.AgenciaId })
            .HasConstraintName("fk_embarques_ruta");
        builder.HasOne(e => e.MetodoEnvio).WithMany()
            .HasForeignKey(e => e.MetodoEnvioId)
            .HasConstraintName("embarques_metodo_envio_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(e => new { e.CreadoPorUsuarioId, e.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_embarques_creado_por");

        builder.HasIndex(e => new { e.AgenciaId, e.CodigoEmbarque }).IsUnique().HasDatabaseName("uq_embarques_codigo");
        builder.HasIndex(e => new { e.AgenciaId, e.Estado }).HasDatabaseName("ix_embarques_estado");
        builder.HasIndex(e => e.RutaId).HasDatabaseName("ix_embarques_ruta");
        builder.HasIndex(e => e.MetodoEnvioId).HasDatabaseName("ix_embarques_metodo");
        builder.HasIndex(e => e.CreadoPorUsuarioId).HasDatabaseName("ix_embarques_creado_por");
    }
}
