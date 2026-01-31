using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ECommerceAPI.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Check if table already exists
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""Products"" (
                    ""Id"" uuid NOT NULL,
                    ""Name"" character varying(100) NOT NULL,
                    ""Description"" character varying(500) NOT NULL,
                    ""Price"" numeric NOT NULL,
                    ""Image"" text,
                    CONSTRAINT ""PK_Products"" PRIMARY KEY (""Id"")
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Products");
        }
    }
}
