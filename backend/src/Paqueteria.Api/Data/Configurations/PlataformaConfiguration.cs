using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Paqueteria.Api.Entities;

namespace Paqueteria.Api.Data.Configurations;

/// <summary>Agencias: tabla de la plataforma, sin RLS.</summary>
public class AgenciaConfiguration : IEntityTypeConfiguration<Agencia>
{
    public void Configure(EntityTypeBuilder<Agencia> builder)
    {
        builder.ToTable("agencias");
        builder.HasKey(a => a.Id).HasName("agencias_pkey");

        builder.Property(a => a.Nombre).HasMaxLength(150);
        builder.Property(a => a.Ruc).HasMaxLength(30);
        builder.Property(a => a.CorreoContacto).HasMaxLength(254);
        builder.Property(a => a.Telefono).HasMaxLength(30);
        builder.Property(a => a.Estado).HasMaxLength(20);
        builder.Property(a => a.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(a => a.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();
        // uq_agencias_nombre es único sobre lower(nombre): índice por expresión, solo en schema.sql.
    }
}

/// <summary>Dueños de la plataforma: sin agencia, sin RLS.</summary>
public class UsuarioPlataformaConfiguration : IEntityTypeConfiguration<UsuarioPlataforma>
{
    public void Configure(EntityTypeBuilder<UsuarioPlataforma> builder)
    {
        builder.ToTable("usuarios_plataforma");
        builder.HasKey(u => u.Id).HasName("usuarios_plataforma_pkey");

        builder.Property(u => u.Nombres).HasMaxLength(100);
        builder.Property(u => u.Apellidos).HasMaxLength(100);
        builder.Property(u => u.Correo).HasMaxLength(254);
        builder.Property(u => u.CreadoEn).FechaActualPorDefecto().GeneradoAlInsertar();
        builder.Property(u => u.ActualizadoEn).FechaActualPorDefecto().MantenidoPorLaBd();

        builder.HasIndex(u => u.AuthUserId).IsUnique().HasDatabaseName("usuarios_plataforma_auth_user_id_key");
        // uq_usuarios_plataforma_correo es único sobre lower(correo): solo en schema.sql.
    }
}
