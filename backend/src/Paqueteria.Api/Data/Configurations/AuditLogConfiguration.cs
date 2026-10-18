using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

/// <summary>
/// La escribe el trigger fn_auditar; el backend solo la lee (RLS: cada agencia la suya).
/// usuario_id y agencia_id no tienen FK a propósito: la auditoría nunca debe impedir una operación.
/// </summary>
public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("audit_logs");
        builder.HasKey(a => a.Id).HasName("audit_logs_pkey");

        builder.Property(a => a.Fecha).FechaActualPorDefecto();
        builder.Property(a => a.Tabla).HasMaxLength(63);
        builder.Property(a => a.RegistroId).HasMaxLength(100);
        builder.Property(a => a.Accion).HasMaxLength(10);
        builder.Property(a => a.ValoresAnteriores).HasColumnType("jsonb");
        builder.Property(a => a.ValoresNuevos).HasColumnType("jsonb");
        builder.Property(a => a.Origen).HasMaxLength(200);
        builder.Property(a => a.TraceId).HasMaxLength(100);

        builder.HasIndex(a => new { a.Tabla, a.RegistroId, a.Id }).HasDatabaseName("ix_audit_logs_registro");
        builder.HasIndex(a => new { a.UsuarioId, a.Id }).HasDatabaseName("ix_audit_logs_usuario");
        builder.HasIndex(a => new { a.AgenciaId, a.Fecha }).HasDatabaseName("ix_audit_logs_fecha");
    }
}
