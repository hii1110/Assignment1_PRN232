using ECommerceAPI.Data;
using ECommerceAPI.DTOs;
using ECommerceAPI.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// 1) DbContext
var connectionString =
    Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();

// JWT Auth
var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtKey = jwtSection["Key"] ?? "CHANGE_ME_SUPER_SECRET_KEY";
var jwtIssuer = jwtSection["Issuer"] ?? "ECommerceAPI";
var jwtAudience = jwtSection["Audience"] ?? "ECommerceClient";

var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
    });

builder.Services.AddAuthorization();

// 2) CORS: đọc danh sách origin từ cấu hình (hoặc cho phép tất cả nếu chưa cấu hình)
var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", p =>
    {
        if (origins.Length > 0)
            p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
        else
            p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod(); // dev nhanh
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// 3) Auto-migrate
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        db.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Skipping migration: {ex.Message}");
    }
}

// 4) Middlewares
app.UseCors("Frontend"); // <-- đặt SAU khi build app, TRƯỚC khi map endpoints

var enableSwagger = app.Environment.IsDevelopment() || builder.Configuration.GetValue<bool>("EnableSwagger");
if (enableSwagger)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Nếu deploy lên Render mà gặp redirect loop, có thể tạm comment dòng này.
// app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

// 5) Endpoints

// Auth endpoints
app.MapPost("/api/auth/register", async (RegisterRequestDto dto, AppDbContext db, IPasswordHasher<User> hasher, IConfiguration config) =>
{
    var email = dto.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(dto.Password))
    {
        return Results.BadRequest(new { error = "Email and password are required" });
    }

    var existing = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email);
    if (existing is not null)
    {
        return Results.BadRequest(new { error = "Email is already registered" });
    }

    var user = new User
    {
        Id = Guid.NewGuid(),
        Email = email
    };
    user.PasswordHash = hasher.HashPassword(user, dto.Password);

    db.Users.Add(user);
    await db.SaveChangesAsync();

    var token = GenerateJwtToken(user, config);
    var response = new AuthResponseDto
    {
        UserId = user.Id,
        Email = user.Email,
        Token = token
    };

    return Results.Ok(response);
});

app.MapPost("/api/auth/login", async (LoginRequestDto dto, AppDbContext db, IPasswordHasher<User> hasher, IConfiguration config) =>
{
    var email = dto.Email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(dto.Password))
    {
        return Results.BadRequest(new { error = "Email and password are required" });
    }

    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
    if (user is null)
    {
        return Results.BadRequest(new { error = "Invalid email or password" });
    }

    var verifyResult = hasher.VerifyHashedPassword(user, user.PasswordHash, dto.Password);
    if (verifyResult == PasswordVerificationResult.Failed)
    {
        return Results.BadRequest(new { error = "Invalid email or password" });
    }

    var token = GenerateJwtToken(user, config);
    var response = new AuthResponseDto
    {
        UserId = user.Id,
        Email = user.Email,
        Token = token
    };

    return Results.Ok(response);
});

// Helper to get current user id from JWT
static Guid? GetUserId(ClaimsPrincipal user)
{
    var id = user.FindFirstValue(ClaimTypes.NameIdentifier)
             ?? user.FindFirstValue(JwtRegisteredClaimNames.Sub);
    if (id is null) return null;
    return Guid.TryParse(id, out var guid) ? guid : null;
}

// GET all products
app.MapGet("/api/products", async (AppDbContext db) =>
{
    var products = await db.Products.ToListAsync();
    var productDtos = products.Select(p => new ProductResponseDto
    {
        Id = p.Id,
        Name = p.Name,
        Description = p.Description,
        Price = p.Price,
        Image = p.Image
    }).ToList();

    return Results.Ok(productDtos);
});

// GET single product
app.MapGet("/api/products/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    if (product is null) return Results.NotFound();

    var productDto = new ProductResponseDto
    {
        Id = product.Id,
        Name = product.Name,
        Description = product.Description,
        Price = product.Price,
        Image = product.Image
    };

    return Results.Ok(productDto);
});

// POST create product
app.MapPost("/api/products", async (CreateProductDto createDto, AppDbContext db) =>
{
    var product = new Product
    {
        Id = Guid.NewGuid(),
        Name = createDto.Name,
        Description = createDto.Description,
        Price = createDto.Price,
        Image = createDto.Image
    };

    db.Products.Add(product);
    await db.SaveChangesAsync();

    var responseDto = new ProductResponseDto
    {
        Id = product.Id,
        Name = product.Name,
        Description = product.Description,
        Price = product.Price,
        Image = product.Image
    };

    return Results.Created($"/api/products/{product.Id}", responseDto);
}).RequireAuthorization();

// PUT update product
app.MapPut("/api/products/{id:guid}", async (Guid id, UpdateProductDto updateDto, AppDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    if (product is null) return Results.NotFound();

    if (!string.IsNullOrEmpty(updateDto.Name)) product.Name = updateDto.Name;
    if (!string.IsNullOrEmpty(updateDto.Description)) product.Description = updateDto.Description;
    if (updateDto.Price.HasValue && updateDto.Price > 0) product.Price = updateDto.Price.Value;
    if (updateDto.Image != null) product.Image = updateDto.Image;

    await db.SaveChangesAsync();

    var responseDto = new ProductResponseDto
    {
        Id = product.Id,
        Name = product.Name,
        Description = product.Description,
        Price = product.Price,
        Image = product.Image
    };

    return Results.Ok(responseDto);
}).RequireAuthorization();


// DELETE product
app.MapDelete("/api/products/{id:guid}", async (Guid id, AppDbContext db) =>
{
    var product = await db.Products.FindAsync(id);
    if (product is null) return Results.NotFound();

    db.Products.Remove(product);
    await db.SaveChangesAsync();
    return Results.Ok();
}).RequireAuthorization();

// Cart endpoints
app.MapGet("/api/cart", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var items = await db.CartItems
        .Include(ci => ci.Product)
        .Where(ci => ci.UserId == userId.Value)
        .ToListAsync();

    var itemDtos = items.Select(ci => new CartItemResponseDto
    {
        Id = ci.Id,
        ProductId = ci.ProductId,
        Name = ci.Product.Name,
        Image = ci.Product.Image,
        Price = ci.Product.Price,
        Quantity = ci.Quantity,
        LineTotal = ci.Quantity * ci.Product.Price
    }).ToList();

    var total = itemDtos.Sum(i => i.LineTotal);

    return Results.Ok(new CartResponseDto
    {
        Items = itemDtos,
        TotalAmount = total
    });
}).RequireAuthorization();

app.MapPost("/api/cart/items", async (AddCartItemRequestDto dto, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    if (dto.Quantity <= 0)
    {
        return Results.BadRequest(new { error = "Quantity must be at least 1" });
    }

    var product = await db.Products.FindAsync(dto.ProductId);
    if (product is null)
    {
        return Results.NotFound(new { error = "Product not found" });
    }

    var existing = await db.CartItems.FirstOrDefaultAsync(ci =>
        ci.UserId == userId.Value && ci.ProductId == dto.ProductId);

    if (existing is null)
    {
        existing = new CartItem
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            ProductId = dto.ProductId,
            Quantity = dto.Quantity,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.CartItems.Add(existing);
    }
    else
    {
        existing.Quantity += dto.Quantity;
        existing.UpdatedAt = DateTime.UtcNow;
    }

    await db.SaveChangesAsync();

    // return updated cart
    return await GetCartResult(userId.Value, db);
}).RequireAuthorization();

app.MapPut("/api/cart/items/{id:guid}", async (Guid id, UpdateCartItemRequestDto dto, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var item = await db.CartItems.FirstOrDefaultAsync(ci => ci.Id == id && ci.UserId == userId.Value);
    if (item is null)
    {
        return Results.NotFound();
    }

    if (dto.Quantity <= 0)
    {
        db.CartItems.Remove(item);
    }
    else
    {
        item.Quantity = dto.Quantity;
        item.UpdatedAt = DateTime.UtcNow;
    }

    await db.SaveChangesAsync();

    return await GetCartResult(userId.Value, db);
}).RequireAuthorization();

app.MapDelete("/api/cart/items/{id:guid}", async (Guid id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var item = await db.CartItems.FirstOrDefaultAsync(ci => ci.Id == id && ci.UserId == userId.Value);
    if (item is null)
    {
        return Results.NotFound();
    }

    db.CartItems.Remove(item);
    await db.SaveChangesAsync();

    return await GetCartResult(userId.Value, db);
}).RequireAuthorization();

// Order endpoints
app.MapPost("/api/orders", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var cartItems = await db.CartItems
        .Include(ci => ci.Product)
        .Where(ci => ci.UserId == userId.Value)
        .ToListAsync();

    if (cartItems.Count == 0)
    {
        return Results.BadRequest(new { error = "Cart is empty" });
    }

    var total = cartItems.Sum(ci => ci.Product.Price * ci.Quantity);

    var order = new Order
    {
        Id = Guid.NewGuid(),
        UserId = userId.Value,
        TotalAmount = total,
        Status = "pending",
        CreatedAt = DateTime.UtcNow
    };

    var orderItems = cartItems.Select(ci => new OrderItem
    {
        Id = Guid.NewGuid(),
        OrderId = order.Id,
        ProductId = ci.ProductId,
        ProductName = ci.Product.Name,
        ProductImage = ci.Product.Image,
        UnitPrice = ci.Product.Price,
        Quantity = ci.Quantity,
        LineTotal = ci.Product.Price * ci.Quantity
    }).ToList();

    order.Items = orderItems;

    db.Orders.Add(order);
    db.OrderItems.AddRange(orderItems);
    db.CartItems.RemoveRange(cartItems);

    await db.SaveChangesAsync();

    var detail = new OrderDetailDto
    {
        Id = order.Id,
        CreatedAt = order.CreatedAt,
        TotalAmount = order.TotalAmount,
        Status = order.Status,
        Items = orderItems.Select(oi => new OrderItemDto
        {
            ProductId = oi.ProductId,
            ProductName = oi.ProductName,
            ProductImage = oi.ProductImage,
            Quantity = oi.Quantity,
            UnitPrice = oi.UnitPrice,
            LineTotal = oi.LineTotal
        }).ToList()
    };

    return Results.Ok(detail);
}).RequireAuthorization();

app.MapGet("/api/orders", async (ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var orders = await db.Orders
        .Where(o => o.UserId == userId.Value)
        .OrderByDescending(o => o.CreatedAt)
        .ToListAsync();

    var result = orders.Select(o => new OrderSummaryDto
    {
        Id = o.Id,
        CreatedAt = o.CreatedAt,
        TotalAmount = o.TotalAmount,
        Status = o.Status
    }).ToList();

    return Results.Ok(result);
}).RequireAuthorization();

app.MapGet("/api/orders/{id:guid}", async (Guid id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var order = await db.Orders
        .Include(o => o.Items)
        .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId.Value);

    if (order is null) return Results.NotFound();

    var detail = new OrderDetailDto
    {
        Id = order.Id,
        CreatedAt = order.CreatedAt,
        TotalAmount = order.TotalAmount,
        Status = order.Status,
        Items = order.Items.Select(oi => new OrderItemDto
        {
            ProductId = oi.ProductId,
            ProductName = oi.ProductName,
            ProductImage = oi.ProductImage,
            Quantity = oi.Quantity,
            UnitPrice = oi.UnitPrice,
            LineTotal = oi.LineTotal
        }).ToList()
    };

    return Results.Ok(detail);
}).RequireAuthorization();

// Optional: simulate payment
app.MapPost("/api/orders/{id:guid}/pay", async (Guid id, ClaimsPrincipal user, AppDbContext db) =>
{
    var userId = GetUserId(user);
    if (userId is null) return Results.Unauthorized();

    var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId.Value);
    if (order is null) return Results.NotFound();

    if (order.Status == "paid")
    {
        return Results.BadRequest(new { error = "Order is already paid" });
    }

    order.Status = "paid";
    order.PaidAt = DateTime.UtcNow;
    await db.SaveChangesAsync();

    return Results.Ok(new { message = "Payment successful" });
}).RequireAuthorization();

app.Run();

static string GenerateJwtToken(User user, IConfiguration config)
{
    var jwtSection = config.GetSection("Jwt");
    var key = jwtSection["Key"] ?? "CHANGE_ME_SUPER_SECRET_KEY";
    var issuer = jwtSection["Issuer"] ?? "ECommerceAPI";
    var audience = jwtSection["Audience"] ?? "ECommerceClient";

    var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

    var claims = new List<Claim>
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim(JwtRegisteredClaimNames.Email, user.Email),
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString())
    };

    var token = new JwtSecurityToken(
        issuer: issuer,
        audience: audience,
        claims: claims,
        expires: DateTime.UtcNow.AddHours(12),
        signingCredentials: credentials
    );

    return new JwtSecurityTokenHandler().WriteToken(token);
}

static async Task<IResult> GetCartResult(Guid userId, AppDbContext db)
{
    var items = await db.CartItems
        .Include(ci => ci.Product)
        .Where(ci => ci.UserId == userId)
        .ToListAsync();

    var itemDtos = items.Select(ci => new CartItemResponseDto
    {
        Id = ci.Id,
        ProductId = ci.ProductId,
        Name = ci.Product.Name,
        Image = ci.Product.Image,
        Price = ci.Product.Price,
        Quantity = ci.Quantity,
        LineTotal = ci.Quantity * ci.Product.Price
    }).ToList();

    var total = itemDtos.Sum(i => i.LineTotal);

    return Results.Ok(new CartResponseDto
    {
        Items = itemDtos,
        TotalAmount = total
    });
}