using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class MetodoEnvioConfiguration : IEntityTypeConfiguration<MetodoEnvio>
{
    public void Configure(EntityTypeBuilder<MetodoEnvio> builder)
    {
        builder.ToTable("metodos_envio");
        builder.HasKey(m => m.Id).HasName("metodos_envio_pkey");

        builder.Property(m => m.Codigo).HasMaxLength(20);
        builder.Property(m => m.Nombre).HasMaxLength(50);
        builder.Property(m => m.PrefijoEmbarque).HasMaxLength(3).IsFixedLength();
        builder.Property(m => m.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(m => m.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasIndex(m => m.Codigo).IsUnique().HasDatabaseName("metodos_envio_codigo_key");
        builder.HasIndex(m => m.PrefijoEmbarque).IsUnique().HasDatabaseName("metodos_envio_prefijo_embarque_key");
    }
}
