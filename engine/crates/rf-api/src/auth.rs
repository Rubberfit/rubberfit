//! Bearer-JWT auth middleware. Extracts `Authorization: Bearer <jwt>`,
//! verifies against the Supabase JWKS cache, and stores a
//! `AuthContext` on the request extensions so downstream handlers can
//! pull it out via `require_auth(req)`.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{decode, decode_header, Algorithm, Validation};

use rf_application::cuts::CutHistoryPort;
use rf_application::error::AppError;
use rf_application::inventory::{
    MaterialSupplierPort, MaterialTypePort, RollPort, SupplierPort,
};
use rf_application::procurement::{PurchaseOrderItemPort, PurchaseOrderPort};
use rf_supabase::{
    PostgrestClient, PostgrestError, SupabaseCutHistoryRepository,
    SupabaseMaterialSupplierRepository, SupabaseMaterialTypeRepository,
    SupabasePurchaseOrderItemRepository, SupabasePurchaseOrderRepository,
    SupabaseRollRepository, SupabaseSupplierRepository,
};

use crate::jwks::{JwksCache, JwksError, SupabaseClaims};

/// Factory that builds a request-scoped `CutHistoryPort` from the
/// caller's auth context. Production impl assembles a
/// `SupabaseCutHistoryRepository`; tests inject fakes to avoid
/// touching Supabase.
pub trait CutHistoryPortFactory: Send + Sync {
    fn build(&self, auth: &AuthContext) -> Result<Arc<dyn CutHistoryPort>, AppError>;
}

/// Factory that builds request-scoped inventory ports. Grouping the
/// four aggregates behind one trait keeps `AppState` from sprouting
/// a new field per aggregate; each method mints the adapter lazily
/// using the caller's JWT so PostgREST + RLS still see the user.
///
/// Tests inject a fake that returns in-memory ports; the
/// production impl is [`SupabaseInventoryFactory`].
pub trait InventoryPortFactory: Send + Sync {
    fn material_types(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError>;

    fn suppliers(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError>;

    fn material_suppliers(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError>;

    fn rolls(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError>;
}

/// Factory for procurement ports (S3c). Grouping PurchaseOrder +
/// PurchaseOrderItem (and the later reorder / CSV-import ports) keeps
/// `AppState` from sprouting one field per aggregate — same ergonomic
/// choice as `InventoryPortFactory`.
///
/// Each call builds a fresh PostgrestClient scoped to the caller's
/// JWT so RLS stays per-request.
pub trait ProcurementPortFactory: Send + Sync {
    fn purchase_orders(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn PurchaseOrderPort>, AppError>;

    fn po_items(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn PurchaseOrderItemPort>, AppError>;
}

/// Production factory — builds a request-scoped PostgrestClient and
/// wraps it in `SupabaseCutHistoryRepository`. Cloning is cheap; the
/// `supabase_url` / `publishable_key` strings are shared-ref-counted
/// via `Arc` at the `AppState` level.
#[derive(Clone)]
pub struct SupabaseCutHistoryFactory {
    pub supabase_url: Arc<str>,
    pub publishable_key: Arc<str>,
}

impl CutHistoryPortFactory for SupabaseCutHistoryFactory {
    fn build(&self, auth: &AuthContext) -> Result<Arc<dyn CutHistoryPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabaseCutHistoryRepository::new(client)))
    }
}

/// Production inventory factory. Each `material_types()` / etc.
/// call builds a fresh `PostgrestClient` + concrete repository so
/// the JWT + RLS story stays per-request.
#[derive(Clone)]
pub struct SupabaseInventoryFactory {
    pub supabase_url: Arc<str>,
    pub publishable_key: Arc<str>,
}

impl InventoryPortFactory for SupabaseInventoryFactory {
    fn material_types(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialTypePort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabaseMaterialTypeRepository::new(client)))
    }

    fn suppliers(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn SupplierPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabaseSupplierRepository::new(client)))
    }

    fn material_suppliers(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn MaterialSupplierPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabaseMaterialSupplierRepository::new(client)))
    }

    fn rolls(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn RollPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabaseRollRepository::new(client)))
    }
}

/// Production procurement factory. Same per-request client pattern
/// as the inventory factory.
#[derive(Clone)]
pub struct SupabaseProcurementFactory {
    pub supabase_url: Arc<str>,
    pub publishable_key: Arc<str>,
}

impl ProcurementPortFactory for SupabaseProcurementFactory {
    fn purchase_orders(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn PurchaseOrderPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabasePurchaseOrderRepository::new(client)))
    }

    fn po_items(
        &self,
        auth: &AuthContext,
    ) -> Result<Arc<dyn PurchaseOrderItemPort>, AppError> {
        let client = build_client(
            self.supabase_url.as_ref(),
            self.publishable_key.as_ref(),
            &auth.raw_jwt,
        )?;
        Ok(Arc::new(SupabasePurchaseOrderItemRepository::new(client)))
    }
}

fn build_client(
    supabase_url: &str,
    publishable_key: &str,
    user_jwt: &str,
) -> Result<PostgrestClient, AppError> {
    PostgrestClient::new(supabase_url, publishable_key, user_jwt)
        .map_err(AppError::infrastructure)
}

/// Shared HTTP-layer state — passed into the auth middleware via
/// `Router::with_state`. Cloning is cheap (`Arc` under the hood).
#[derive(Clone)]
pub struct AppState {
    pub jwks: JwksCache,
    /// Expected `iss` claim: `<SUPABASE_URL>/auth/v1`. Verified with
    /// an exact match after stripping trailing slashes.
    pub expected_issuer: String,
    /// Base URL for Supabase REST calls. e.g. `https://project.supabase.co`.
    pub supabase_url: String,
    /// Publishable / anon key for the project. Goes onto the `apikey`
    /// header of every PostgREST call. Does NOT grant privileges on
    /// its own — RLS enforces scoping via the user JWT.
    pub supabase_publishable_key: String,
    /// Factory for cut-history ports. Production uses
    /// `SupabaseCutHistoryFactory`; tests inject fakes.
    pub cut_history_factory: Arc<dyn CutHistoryPortFactory>,
    /// Factory for inventory ports — material types, suppliers,
    /// material-supplier links, rolls. One factory per AppState
    /// keeps the aggregate-count from blowing up new fields as
    /// S3b expands.
    pub inventory_factory: Arc<dyn InventoryPortFactory>,
    /// Factory for procurement ports — purchase orders + line items
    /// in S3c Task 2; reorder + CSV import join as later S3c tasks
    /// land. Same aggregate-grouping rationale as `inventory_factory`.
    pub procurement_factory: Arc<dyn ProcurementPortFactory>,
}

impl AppState {
    /// Minimal constructor used by most of the tests — supplies a
    /// placeholder publishable key that's only valid for mocked
    /// transports. Use `with_supabase` to pass a real key, or
    /// `with_factories` to swap in test doubles.
    pub fn new(jwks: JwksCache, supabase_url: impl Into<String>) -> Self {
        Self::with_supabase(jwks, supabase_url, "test-publishable-key")
    }

    /// Full constructor — callers provide the project's publishable
    /// key so `user_postgrest` can stamp it on outgoing requests.
    pub fn with_supabase(
        jwks: JwksCache,
        supabase_url: impl Into<String>,
        supabase_publishable_key: impl Into<String>,
    ) -> Self {
        let base = supabase_url.into();
        let key = supabase_publishable_key.into();
        let cut_history_factory: Arc<dyn CutHistoryPortFactory> =
            Arc::new(SupabaseCutHistoryFactory {
                supabase_url: Arc::from(base.clone()),
                publishable_key: Arc::from(key.clone()),
            });
        let inventory_factory: Arc<dyn InventoryPortFactory> =
            Arc::new(SupabaseInventoryFactory {
                supabase_url: Arc::from(base.clone()),
                publishable_key: Arc::from(key.clone()),
            });
        let procurement_factory: Arc<dyn ProcurementPortFactory> =
            Arc::new(SupabaseProcurementFactory {
                supabase_url: Arc::from(base.clone()),
                publishable_key: Arc::from(key.clone()),
            });
        Self::with_factories(
            jwks,
            base,
            key,
            cut_history_factory,
            inventory_factory,
            procurement_factory,
        )
    }

    /// Test-oriented constructor that lets tests inject fakes for
    /// all three factories. Existing S3a callers that only need to swap
    /// the cut-history factory use [`Self::with_cut_history_factory`].
    pub fn with_factories(
        jwks: JwksCache,
        supabase_url: impl Into<String>,
        supabase_publishable_key: impl Into<String>,
        cut_history_factory: Arc<dyn CutHistoryPortFactory>,
        inventory_factory: Arc<dyn InventoryPortFactory>,
        procurement_factory: Arc<dyn ProcurementPortFactory>,
    ) -> Self {
        let base = supabase_url.into();
        let expected_issuer = format!("{}/auth/v1", base.trim_end_matches('/'));
        Self {
            jwks,
            expected_issuer,
            supabase_url: base,
            supabase_publishable_key: supabase_publishable_key.into(),
            cut_history_factory,
            inventory_factory,
            procurement_factory,
        }
    }

    /// S3a-era back-compat constructor — only overrides the cut-history
    /// factory; the inventory + procurement factories stay the
    /// production Supabase impls. Keeps the existing cut-history
    /// integration tests working without a cross-cutting refactor.
    pub fn with_cut_history_factory(
        jwks: JwksCache,
        supabase_url: impl Into<String>,
        supabase_publishable_key: impl Into<String>,
        cut_history_factory: Arc<dyn CutHistoryPortFactory>,
    ) -> Self {
        let base = supabase_url.into();
        let key = supabase_publishable_key.into();
        let inventory_factory: Arc<dyn InventoryPortFactory> =
            Arc::new(SupabaseInventoryFactory {
                supabase_url: Arc::from(base.clone()),
                publishable_key: Arc::from(key.clone()),
            });
        let procurement_factory: Arc<dyn ProcurementPortFactory> =
            Arc::new(SupabaseProcurementFactory {
                supabase_url: Arc::from(base.clone()),
                publishable_key: Arc::from(key.clone()),
            });
        Self::with_factories(
            jwks,
            base,
            key,
            cut_history_factory,
            inventory_factory,
            procurement_factory,
        )
    }
}

/// Build a fresh PostgREST client scoped to a single verified user.
/// This is the canonical path for handlers to talk to Supabase. The
/// alternative — sharing a long-lived client across requests — would
/// require the service role key and bypass RLS, which the S3 spec
/// explicitly disallows.
pub fn user_postgrest(
    state: &AppState,
    auth: &AuthContext,
) -> Result<PostgrestClient, PostgrestError> {
    PostgrestClient::new(
        state.supabase_url.clone(),
        &state.supabase_publishable_key,
        &auth.raw_jwt,
    )
}

/// Everything the verification step proved true about the caller. Lives
/// on the request extensions after the middleware runs; handlers read
/// it with the `require_auth` helper.
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub claims: SupabaseClaims,
    /// The verbatim Bearer token, preserved because downstream
    /// Supabase PostgREST calls need to forward it (RLS scoping).
    pub raw_jwt: String,
}

/// Pull the [`AuthContext`] inserted by the middleware. Handlers
/// should call this instead of reaching into extensions directly.
pub fn require_auth(req: &Request) -> Result<&AuthContext, AuthError> {
    req.extensions()
        .get::<AuthContext>()
        .ok_or(AuthError::Missing)
}

/// Axum `from_fn_with_state` middleware. Runs on every route it
/// wraps; 401s anything missing or malformed, 503s if JWKS is
/// unreachable. Success installs `AuthContext` on the request.
pub async fn jwt_middleware(
    State(state): State<Arc<AppState>>,
    mut req: Request,
    next: Next,
) -> Response {
    let token = match extract_bearer(&req) {
        Ok(t) => t,
        Err(err) => return err.into_response(),
    };

    let claims = match verify(&state, &token).await {
        Ok(c) => c,
        Err(err) => return err.into_response(),
    };

    req.extensions_mut().insert(AuthContext {
        claims,
        raw_jwt: token,
    });
    next.run(req).await
}

fn extract_bearer(req: &Request) -> Result<String, AuthError> {
    let header = req
        .headers()
        .get(header::AUTHORIZATION)
        .ok_or(AuthError::Missing)?
        .to_str()
        .map_err(|_| AuthError::Malformed)?;
    let stripped = header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or(AuthError::Malformed)?;
    Ok(stripped.trim().to_string())
}

async fn verify(state: &AppState, token: &str) -> Result<SupabaseClaims, AuthError> {
    let header = decode_header(token).map_err(|_| AuthError::Malformed)?;
    if header.alg != Algorithm::RS256 {
        return Err(AuthError::UnsupportedAlg);
    }
    let kid = header.kid.ok_or(AuthError::Malformed)?;

    let key = match state.jwks.get_decoding_key(&kid).await {
        Ok(k) => k,
        Err(JwksError::UnknownKid { .. }) => return Err(AuthError::UnknownKid),
        Err(_) => return Err(AuthError::JwksUnavailable),
    };

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[state.expected_issuer.as_str()]);
    validation.leeway = 30;
    // Supabase tokens carry `aud = "authenticated"`; we defer audience
    // enforcement to downstream (Postgres RLS already scopes via JWT
    // sub + role), so disable it here to keep the middleware permissive
    // across session types (authenticated vs anon mobile clients).
    validation.validate_aud = false;

    let data = decode::<SupabaseClaims>(token, &key, &validation)
        .map_err(|e| match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::Expired,
            jsonwebtoken::errors::ErrorKind::InvalidIssuer => AuthError::WrongIssuer,
            _ => AuthError::Invalid,
        })?;
    Ok(data.claims)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    /// No Authorization header at all.
    Missing,
    /// Header present but wrong shape (no "Bearer" prefix, non-ASCII).
    Malformed,
    /// Token's `alg` is not RS256.
    UnsupportedAlg,
    /// Token references a `kid` we've never seen even after a refresh.
    UnknownKid,
    /// JWKS endpoint unreachable. Transient — return 503.
    JwksUnavailable,
    /// Signature does not verify or the claim set is invalid.
    Invalid,
    /// Valid signature but `exp` has passed.
    Expired,
    /// Valid signature but `iss` is not our Supabase project.
    WrongIssuer,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            AuthError::Missing => (StatusCode::UNAUTHORIZED, "missing Authorization"),
            AuthError::Malformed => (StatusCode::UNAUTHORIZED, "malformed Authorization"),
            AuthError::UnsupportedAlg => (StatusCode::UNAUTHORIZED, "unsupported token alg"),
            AuthError::UnknownKid => (StatusCode::UNAUTHORIZED, "unknown kid"),
            AuthError::JwksUnavailable => {
                (StatusCode::SERVICE_UNAVAILABLE, "auth service unavailable")
            }
            AuthError::Invalid => (StatusCode::UNAUTHORIZED, "invalid token"),
            AuthError::Expired => (StatusCode::UNAUTHORIZED, "expired token"),
            AuthError::WrongIssuer => (StatusCode::UNAUTHORIZED, "wrong token issuer"),
        };
        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, "text/plain")
            .body(Body::from(body))
            .unwrap_or_else(|_| StatusCode::UNAUTHORIZED.into_response())
    }
}
