---
name: testing-best-practices
category: Quality
description: "MUST USE when writing, reviewing, or modifying tests. Enforces Arrange-Act-Assert, factory-based test data, test isolation, mocking boundaries, and pyramid-balanced coverage."
---

# Testing Best Practices

## Testing Pyramid

| Layer | Share | Speed | Examples |
|-------|-------|-------|----------|
| Unit | ~70% | Fast (ms) | Pure logic, validators, utils |
| Integration | ~20% | Medium (s) | API endpoints, DB queries, service + repo |
| E2E | ~10% | Slow (10s+) | Login → checkout → confirmation |

**Test:** business logic, edge cases, error paths, public API contracts.
**Skip:** framework internals, third-party lib behavior, private methods, trivial getters.

## Test Behavior, Not Implementation

```python
# BAD: testing internals
def test_user_creation():
    service = UserService()
    service.create_user("alice@example.com")
    service._repo.insert.assert_called_once_with({"email": "alice@example.com", "role": "member"})

# GOOD: testing observable behavior
def test_create_user_stores_user_with_default_role():
    service = UserService()
    service.create_user("alice@example.com")
    user = service.get_user("alice@example.com")
    assert user.email == "alice@example.com"
    assert user.role == "member"
```

## Arrange-Act-Assert

One behavior per test. If you need "and" in the test name, split it.

```python
# GOOD
def test_place_order_calculates_total_from_price_and_quantity():
    # Arrange
    user = UserFactory()
    product = ProductFactory(price=10)
    # Act
    order = OrderService.place_order(user, product, quantity=3)
    # Assert
    assert order.total == 30
```

```typescript
test("adding items updates the cart total", () => {
  const cart = new Cart();
  cart.add({ id: 1, price: 10 });
  cart.add({ id: 2, price: 20 });
  expect(cart.total).toBe(30);
});
```

## Naming: `test_[what]_[scenario]_[expected]`

```python
# BAD
def test_order(): ...
def test_it_works(): ...

# GOOD
def test_place_order_with_insufficient_stock_raises_out_of_stock(): ...
def test_cancel_order_after_shipment_raises_not_cancellable(): ...
```

## Factory Pattern for Test Data

Minimal defaults, override only what matters.

```python
# GOOD: factory_boy
class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
    username = factory.Sequence(lambda n: f"user-{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    is_active = True
    class Params:
        admin = factory.Trait(is_staff=True, is_superuser=True)

user = UserFactory()
admin = UserFactory(admin=True)
inactive = UserFactory(is_active=False)
```

```typescript
// GOOD: fishery
const userFactory = Factory.define<User>(({ sequence, params }) => ({
  id: sequence,
  email: `user-${sequence}@example.com`,
  role: params.admin ? "admin" : "member",
  isActive: true,
}));

const user = userFactory.build();
const admin = userFactory.build({ admin: true });
```

Use **fixtures** for infrastructure (DB, client), **factories** for data (models, DTOs).

## Test Isolation

Each test must be independent. No shared mutable state.

```python
# BAD: module-level shared state
cart = Cart()
def test_add_item():
    cart.add(Item(price=10))
    assert cart.total == 10
def test_cart_is_empty():
    assert cart.total == 0  # FAILS — polluted

# GOOD: fresh state per test
@pytest.fixture
def cart():
    return Cart()

def test_add_item(cart):
    cart.add(Item(price=10))
    assert cart.total == 10
```

- Transaction rollback or truncation between tests
- Never rely on test execution order
- Reset singletons and caches in `beforeEach`/`setUp`

## Mocking — Only at the Boundary

**Mock:** external HTTP APIs, file/network I/O, time, non-deterministic values.
**Don't mock:** your own DB in integration tests, stdlib, the system under test.

```python
# BAD: over-mocking — testing nothing real
@patch("app.services.order.OrderRepository")
@patch("app.services.order.PaymentGateway")
@patch("app.services.order.InventoryService")
def test_place_order(mock_inv, mock_pay, mock_repo):
    service = OrderService()
    service.place_order(user_id=1, items=[{"id": 1, "qty": 2}])
    mock_repo.return_value.save.assert_called_once()

# GOOD: mock only the external boundary
def test_place_order_charges_payment_gateway(db_session):
    user = UserFactory()
    product = ProductFactory(price=25, stock=10)
    mock_gateway = Mock(spec=PaymentGateway)
    mock_gateway.charge.return_value = ChargeResult(success=True, tx_id="tx-123")
    service = OrderService(payment_gateway=mock_gateway)

    order = service.place_order(user, items=[{"product_id": product.id, "qty": 2}])

    mock_gateway.charge.assert_called_once_with(amount=50, user_id=user.id)
    assert order.status == "confirmed"
```

## Parameterized Tests

```python
@pytest.mark.parametrize("email, is_valid", [
    ("user@example.com", True),
    ("", False),
    ("missing-at-sign", False),
    ("@no-local.com", False),
], ids=["valid", "empty", "missing @", "no local part"])
def test_validate_email(email, is_valid):
    assert validate_email(email) == is_valid
```

```typescript
test.each([
  { input: "hello world", expected: "hello-world", desc: "spaces to hyphens" },
  { input: "", expected: "", desc: "empty string" },
])("slugify: $desc", ({ input, expected }) => {
  expect(slugify(input)).toBe(expected);
});
```

## Rules

1. **Test behavior, not implementation** — assert on outputs, not internal method calls
2. **One behavior per test** — if you need "and" in the name, split it
3. **Arrange-Act-Assert** — three clear phases, no mixing
4. **Descriptive names** — `test_[what]_[scenario]_[expected]`
5. **Factories for test data** — minimal defaults, override only what matters
6. **Mock at the boundary** — external services and I/O only
7. **Isolate every test** — no shared mutable state, transaction rollback
8. **Follow the pyramid** — ~70% unit, ~20% integration, ~10% E2E
9. **Parameterize repetitive cases** — `parametrize`/`test.each` with descriptive IDs
10. **Fix or delete flaky tests** — a flaky test is worse than no test
