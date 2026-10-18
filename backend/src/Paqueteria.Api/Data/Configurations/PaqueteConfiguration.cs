using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class PaqueteConfiguration : IEntityTypeConfiguration<Paquete>
{
    public void Configure(EntityTypeBuilder<Paquete> builder)
    {
        builder.ToTable("paquetes");
        builder.HasKey(p => p.Id).HasName("paquetes_pkey");

        builder.Property(p => p.AgenciaId).AgenciaDeLaSesion();
        builder.Property(p => p.CodigoPaquete).HasMaxLength(20).GeneradoAlInsertar();
        builder.Property(p => p.TrackingExterno).HasMaxLength(100);
        builder.Property(p => p.Tienda).HasMaxLength(100);
        builder.Property(p => p.PesoLb).HasPrecision(10, 2);
        builder.Property(p => p.TarifaAplicada).HasPrecision(12, 4);
        builder.Property(p => p.MontoCalculado).HasPrecision(18, 2);
        builder.Property(p => p.FechaRegistro).FechaActualPorDefecto();
        builder.Property(p => p.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        // Los produce el historial (trg_historial_aplicar_estado). Un UPDATE directo se rechaza.
        builder.Property(p => p.EstadoActualId).MantenidoPorLaBd();
        builder.Property(p => p.FechaRecepcionMiami).MantenidoPorLaBd();
        builder.Property(p => p.FechaRecepcionNicaragua).MantenidoPorLaBd();

        builder.HasAlternateKey(p => new { p.Id, p.AgenciaId }).HasName("uq_paquetes_id_agencia");

        builder.HasOne(p => p.Cliente).WithMany()
            .HasForeignKey(p => new { p.ClienteId, p.AgenciaId })
            .HasPrincipalKey(c => new { c.Id, c.AgenciaId })
            .HasConstraintName("fk_paquetes_cliente");
        builder.HasOne(p => p.MetodoEnvio).WithMany()
            .HasForeignKey(p => p.MetodoEnvioId)
            .HasConstraintName("paquetes_metodo_envio_id_fkey");
        builder.HasOne(p => p.EstadoActual).WithMany()
            .HasForeignKey(p => p.EstadoActualId)
            .HasConstraintName("paquetes_estado_actual_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(p => new { p.RegistradoPorUsuarioId, p.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .HasConstraintName("fk_paquetes_registrado_por");

        // FK compuestas: embarque y tarifa deben ser del mismo método de envío y agencia que el paquete.
        builder.HasOne(p => p.Embarque).WithMany(e => e.Paquetes)
            .HasForeignKey(p => new { p.EmbarqueId, p.MetodoEnvioId, p.AgenciaId })
            .HasPrincipalKey(e => new { e.Id, e.MetodoEnvioId, e.AgenciaId })
            .IsRequired(false)
            .HasConstraintName("fk_paquetes_embarque_mismo_metodo");
        builder.HasOne(p => p.Tarifa).WithMany()
            .HasForeignKey(p => new { p.TarifaId, p.MetodoEnvioId, p.AgenciaId })
            .HasPrincipalKey(t => new { t.Id, t.MetodoEnvioId, t.AgenciaId })
            .IsRequired(false)
            .HasConstraintName("fk_paquetes_tarifa_mismo_metodo");

        builder.HasIndex(p => new { p.AgenciaId, p.CodigoPaquete }).IsUnique().HasDatabaseName("uq_paquetes_codigo");
        builder.HasIndex(p => p.ClienteId).HasDatabaseName("ix_paquetes_cliente");
        builder.HasIndex(p => new { p.AgenciaId, p.EstadoActualId }).HasDatabaseName("ix_paquetes_estado");
        builder.HasIndex(p => p.EmbarqueId).HasDatabaseName("ix_paquetes_embarque").HasFilter("embarque_id IS NOT NULL");
        builder.HasIndex(p => p.MetodoEnvioId).HasDatabaseName("ix_paquetes_metodo");
        builder.HasIndex(p => p.TarifaId).HasDatabaseName("ix_paquetes_tarifa").HasFilter("tarifa_id IS NOT NULL");
        builder.HasIndex(p => p.RegistradoPorUsuarioId).HasDatabaseName("ix_paquetes_registrado_por");
        builder.HasIndex(p => new { p.AgenciaId, p.FechaRegistro }).HasDatabaseName("ix_paquetes_fecha_registro");
        // uq_paquetes_tracking_vigente es único sobre (agencia_id, upper(tracking_externo)): índice
        // por expresión, solo en schema.sql.
    }
}
