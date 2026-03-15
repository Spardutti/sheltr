---
name: security-practices
category: Quality
description: "MUST USE when writing or reviewing code that handles user input, authentication, authorization, API endpoints, database queries, secrets, or any security-sensitive functionality. Enforces OWASP Top 10 prevention, secure defaults, and defense-in-depth patterns."
---

# Security Best Practices

## Input Validation — Never Trust the Client

```python
# BAD: no validation
@app.post("/users")
async def create_user(data: dict):
    db.execute(f"INSERT INTO users (email) VALUES ('{data['email']}')")

# GOOD: strict schema + parameterized query
class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")

@app.post("/users")
async def create_user(data: UserCreate):
    await user_service.create(data)
```

```typescript
// GOOD: validate with zod
const UserCreate = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_-]+$/),
});
app.post("/users", (req, res) => {
  const data = UserCreate.parse(req.body);
});
```

### Allowlist Over Denylist

```python
# BAD: blocking known-bad input
for bad in ["<script>", "DROP TABLE"]:
    value = value.replace(bad, "")

# GOOD: only allow known-good
class SortParams(BaseModel):
    sort_by: Literal["created_at", "updated_at", "name", "price"]
    order: Literal["asc", "desc"] = "asc"
```

## SQL Injection Prevention

```python
# BAD: string interpolation
query = f"SELECT * FROM users WHERE username = '{username}'"

# GOOD: parameterized
cursor.execute("SELECT * FROM users WHERE username = %s", (username,))

# GOOD: SQLAlchemy ORM — automatically parameterized
user = await db.execute(select(User).where(User.username == username))
```

```typescript
// BAD
const query = `SELECT * FROM users WHERE id = ${userId}`;
// GOOD
await db.query("SELECT * FROM users WHERE id = $1", [userId]);
```

Never interpolate column/table names from user input — validate against an allowlist.

## XSS Prevention

```python
# BAD: raw HTML
return HTMLResponse(f"<h1>Hello {name}</h1>")

# GOOD: auto-escaping templates (Jinja2)
return templates.TemplateResponse("greet.html", {"request": request, "name": name})
```

### Security Headers

```python
response.headers["X-Content-Type-Options"] = "nosniff"
response.headers["X-Frame-Options"] = "DENY"
response.headers["Content-Security-Policy"] = "default-src 'self'"
response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
```

```typescript
import helmet from "helmet";
app.use(helmet());
```

## Authentication

### Hash Passwords with bcrypt

```python
# BAD
hashed = hashlib.md5(password.encode()).hexdigest()
# GOOD
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
hashed = pwd_context.hash(password)
is_valid = pwd_context.verify(plain_password, hashed)
```

### JWT — Short Expiry, Pinned Algorithm

```python
# BAD: no expiry, allows "none" algorithm
token = jwt.encode({"user_id": 1}, "secret")
data = jwt.decode(token, "secret", algorithms=["HS256", "none"])

# GOOD
token = jwt.encode(
    {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(minutes=15)},
    settings.jwt_secret, algorithm="HS256",
)
payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
```

### Generic Auth Errors

```python
# BAD: reveals which field is wrong
if not user: raise HTTPException(400, "User not found")
if not verify_password(...): raise HTTPException(400, "Incorrect password")

# GOOD: prevents user enumeration
if not user or not verify_password(password, user.hashed_password):
    raise HTTPException(401, "Incorrect username or password")
```

## Authorization

```python
# BAD: IDOR — any user can access any order
@router.get("/orders/{order_id}")
async def get_order(order_id: int, db: DBSession):
    return await db.get(Order, order_id)

# GOOD: scope to authenticated user
@router.get("/orders/{order_id}")
async def get_order(order_id: int, db: DBSession, user: CurrentUser):
    order = await db.execute(
        select(Order).where(Order.id == order_id, Order.user_id == user.id)
    )
    if not (order := order.scalar_one_or_none()):
        raise HTTPException(status_code=404)
    return order

# Role-based access
def require_role(*roles: str):
    async def check(current_user: CurrentUser):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return current_user
    return check

AdminUser = Annotated[User, Depends(require_role("admin"))]
```

## Secrets

```python
# BAD: hardcoded
JWT_SECRET = "super-secret-key-123"

# GOOD: environment variables with validation
class Settings(BaseSettings):
    jwt_secret: str
    database_url: str
    model_config = SettingsConfigDict(env_file=".env")
```

```gitignore
.env
*.pem
*.key
credentials.json
```

## Error Handling — Never Leak Internals

```python
# BAD
return JSONResponse(status_code=500, content={"detail": str(exc)})
# GOOD
logger.exception("Unhandled error", exc_info=exc)
return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

## CORS

```python
# BAD: wildcard with credentials
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True)
# GOOD: explicit origins
app.add_middleware(CORSMiddleware, allow_origins=["https://app.example.com"],
    allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"])
```

## Cookies

```python
response.set_cookie(key="session", value=token,
    httponly=True, secure=True, samesite="lax", max_age=3600)
```

## Rules

1. **Validate all input server-side** — Pydantic, Zod, or equivalent
2. **Allowlist over denylist** — validate against known-good values
3. **Parameterize all queries** — never interpolate user input into SQL
4. **Escape all output** — auto-escaping templates, CSP header
5. **Hash passwords with bcrypt/argon2** — never MD5/SHA/plain text
6. **Pin JWT algorithm, set short expiry** — never allow `"none"`
7. **Generic auth errors** — never reveal which field was wrong
8. **Scope queries to authenticated user** — prevent IDOR
9. **Never hardcode secrets** — env variables, `.env` in `.gitignore`
10. **Never leak internal errors** — log details, return generic messages
11. **Explicit CORS origins** — never `"*"` with credentials
12. **Secure cookie flags** — `httponly`, `secure`, `samesite`
