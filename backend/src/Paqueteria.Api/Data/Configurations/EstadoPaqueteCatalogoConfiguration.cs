using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class EstadoPaqueteCatalogoConfiguration : IEntityTypeConfiguration<EstadoPaqueteCatalogo>
{
    public void Configure(EntityTypeBuilder<EstadoPaqueteCatalogo> builder)
    {
        builder.ToTable("estados_paquete");
        builder.HasKey(e => e.Id).HasName("estados_paquete_pkey");

        // Ids fijos 1–11, asignados a mano en schema.sql.
        builder.Property(e => e.Id).ValueGeneratedNever();
        builder.Property(e => e.Codigo).HasMaxLength(30);
        builder.Property(e => e.Nombre).HasMaxLength(60);

        builder.HasIndex(e => e.Codigo).IsUnique().HasDatabaseName("estados_paquete_codigo_key");
        builder.HasIndex(e => e.Orden).IsUnique().HasDatabaseName("estados_paquete_orden_key");
    }
}
