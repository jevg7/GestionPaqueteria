using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class TarifaEnvioConfiguration : IEntityTypeConfiguration<TarifaEnvio>
{
    public void Configure(EntityTypeBuilder<TarifaEnvio> builder)
    {
        builder.ToTable("tarifas_envio");
        builder.HasKey(t => t.Id).HasName("tarifas_envio_pkey");

        builder.Property(t => t.AgenciaId).AgenciaDeLaSesion();
        builder.Property(t => t.PrecioPorUnidad).HasPrecision(12, 4);
        builder.Property(t => t.Unidad).HasMaxLength(10);
        builder.Property(t => t.Moneda).HasMaxLength(3).IsFixedLength();
        builder.Property(t => t.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(t => t.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        // Destino de la FK compuesta de paquetes: la tarifa de un paquete es de su mismo método y agencia.
        builder.HasAlternateKey(t => new { t.Id, t.MetodoEnvioId, t.AgenciaId }).HasName("uq_tarifas_id_metodo");

        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(t => t.AgenciaId)
            .HasConstraintName("tarifas_envio_agencia_id_fkey");
        builder.HasOne(t => t.MetodoEnvio).WithMany()
            .HasForeignKey(t => t.MetodoEnvioId)
            .HasConstraintName("tarifas_envio_metodo_envio_id_fkey");
        builder.HasOne<Usuario>().WithMany()
            .HasForeignKey(t => new { t.CreadoPorUsuarioId, t.AgenciaId })
            .HasPrincipalKey(u => new { u.Id, u.AgenciaId })
            .IsRequired(false)
            .HasConstraintName("fk_tarifas_creado_por");

        builder.HasIndex(t => t.MetodoEnvioId).HasDatabaseName("ix_tarifas_metodo");
        builder.HasIndex(t => t.CreadoPorUsuarioId).HasDatabaseName("ix_tarifas_creado_por").HasFilter("creado_por_usuario_id IS NOT NULL");
        // ex_tarifas_sin_traslape (EXCLUDE USING gist) solo existe en schema.sql.
    }
}
