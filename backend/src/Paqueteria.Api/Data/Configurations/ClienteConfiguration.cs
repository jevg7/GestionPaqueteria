using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class ClienteConfiguration : IEntityTypeConfiguration<Cliente>
{
    public void Configure(EntityTypeBuilder<Cliente> builder)
    {
        builder.ToTable("clientes");
        builder.HasKey(c => c.Id).HasName("clientes_pkey");

        builder.Property(c => c.AgenciaId).AgenciaDeLaSesion();
        // Correlativo de la agencia (fn_siguiente_correlativo('CLI')).
        builder.Property(c => c.CodigoCliente).HasMaxLength(20).GeneradoAlInsertar();
        builder.Property(c => c.Nombres).HasMaxLength(100);
        builder.Property(c => c.Apellidos).HasMaxLength(100);
        builder.Property(c => c.Telefono).HasMaxLength(30);
        builder.Property(c => c.Correo).HasMaxLength(254);
        builder.Property(c => c.FechaRegistro).FechaActualPorDefecto();
        builder.Property(c => c.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasAlternateKey(c => new { c.Id, c.AgenciaId }).HasName("uq_clientes_id_agencia");
        builder.HasOne<Agencia>().WithMany()
            .HasForeignKey(c => c.AgenciaId)
            .HasConstraintName("clientes_agencia_id_fkey");

        builder.HasIndex(c => new { c.AgenciaId, c.CodigoCliente }).IsUnique().HasDatabaseName("uq_clientes_codigo");
        builder.HasIndex(c => new { c.AgenciaId, c.Telefono }).HasDatabaseName("ix_clientes_telefono");
        // ix_clientes_nombre_trgm (GIN por trigramas) e ix_clientes_correo (lower(correo)) son
        // índices por expresión: solo en schema.sql.
    }
}
