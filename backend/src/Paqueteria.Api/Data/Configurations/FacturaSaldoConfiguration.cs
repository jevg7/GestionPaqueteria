using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

public class FacturaSaldoConfiguration : IEntityTypeConfiguration<FacturaSaldo>
{
    public void Configure(EntityTypeBuilder<FacturaSaldo> builder)
    {
        builder.ToView("v_facturas_saldo");
        builder.HasNoKey();

        builder.Property(s => s.NumeroFactura).HasMaxLength(20);
        builder.Property(s => s.Total).HasPrecision(18, 2);
        builder.Property(s => s.Estado).HasMaxLength(20);
        builder.Property(s => s.Pagado).HasPrecision(18, 2);
        builder.Property(s => s.Saldo).HasPrecision(18, 2);
        // La vista calcula estado_pago con un CASE de literales: su tipo es text.
        builder.Property(s => s.EstadoPago).HasColumnType("text");
    }
}
