import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

/**
 * Simple card wrapper for consistent styling.
 */
function Card({ children }) {
  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 14,
        padding: 12,
        background: "white",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Reusable input field with label.
 */
function Field({ label, ...props }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, opacity: 0.8 }}>{label}</span>
      <input
        {...props}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #ccc",
          width: "100%",
        }}
      />
    </label>
  );
}

/**
 * PLU Substitutions App
 *
 * Responsibilities:
 * - Public read access for staff and customers (no login required)
 * - Authenticated edit access for admin and managers (login required)
 * - Live search filtering for quick lookups on mobile
 *
 * Security boundary:
 * - Uses Supabase anon key in the browser (safe)
 * - Row Level Security (RLS) enforces read/write permissions server-side
 */
export default function App() {
  // Supabase data rows
  const [rows, setRows] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Auth session determines whether edit controls are available
  const [session, setSession] = useState(null);

  // Login modal state
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Editor modal state
  // editing: null (closed), { id: null } (add), or a row (edit)
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    product_name: "",
    old_code: "",
    new_code: "",
    notes: "",
  });

  const isAuthed = !!session?.user;

  /**
   * Reloads substitutions from Supabase.
   * Used by the Refresh button and after mutations (save/delete).
   */
  const loadData = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("code_substitutions")
      .select("id, product_name, old_code, new_code, notes")
      .order("product_name", { ascending: true });

    if (!error && Array.isArray(data)) setRows(data);
    setLoading(false);
  };

  /**
   * Initial data load (on mount).
   * We avoid direct setState calls in the effect body that trigger lint warnings by:
   * - defining the async function inside the effect
   * - using an ignore flag to avoid setting state after unmount
   */
  useEffect(() => {
    let ignore = false;

    const fetchRows = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("code_substitutions")
        .select("id, product_name, old_code, new_code, notes")
        .order("product_name", { ascending: true });

      if (!ignore) {
        if (!error && Array.isArray(data)) setRows(data);
        setLoading(false);
      }
    };

    fetchRows();

    return () => {
      ignore = true;
    };
  }, []);

  /**
   * Keep auth session in sync.
   * This enables the UI to show admin controls immediately after login/logout.
   */
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) setSession(data.session || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * Live search results as user types.
   * Dataset is small (typically ~50), so client-side filtering is fast.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const hay = [r.product_name, r.old_code, r.new_code, r.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query]);

  /**
   * Opens "Add substitution" editor with an empty form.
   */
  const openAdd = () => {
    setEditing({ id: null });
    setForm({ product_name: "", old_code: "", new_code: "", notes: "" });
  };

  /**
   * Opens "Edit substitution" editor with the selected row values.
   */
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      product_name: row.product_name || "",
      old_code: row.old_code || "",
      new_code: row.new_code || "",
      notes: row.notes || "",
    });
  };

  /**
   * Closes the editor modal and resets the form.
   */
  const closeEditor = () => {
    setEditing(null);
    setForm({ product_name: "", old_code: "", new_code: "", notes: "" });
  };

  /**
   * Saves a substitution:
   * - Inserts when editing.id is null (add mode)
   * - Updates when editing.id exists (edit mode)
   *
   * RLS enforces that only authenticated users can write.
   */
  const saveRow = async () => {
    const payload = {
      product_name: form.product_name.trim(),
      old_code: form.old_code.trim(),
      new_code: form.new_code.trim(),
      notes: form.notes?.trim() ? form.notes.trim() : null,
    };

    if (!payload.product_name || !payload.old_code || !payload.new_code) {
      alert("Please fill Product Name, Old Code, and New Code.");
      return;
    }

    if (!isAuthed) {
      alert("You must be logged in to edit.");
      return;
    }

    const result = editing?.id
      ? await supabase.from("code_substitutions").update(payload).eq("id", editing.id)
      : await supabase.from("code_substitutions").insert([payload]);

    if (result.error) {
      alert("Save failed. Check your login and try again.");
      return;
    }

    await loadData();
    closeEditor();
  };

  /**
   * Deletes a substitution after confirmation.
   * This is irreversible, so we confirm before writing.
   */
  const deleteRow = async (row) => {
    if (!isAuthed) {
      alert("You must be logged in to delete.");
      return;
    }

    const ok = confirm(`Delete "${row.product_name}" (Old ${row.old_code})?`);
    if (!ok) return;

    const { error } = await supabase.from("code_substitutions").delete().eq("id", row.id);

    if (error) {
      alert("Delete failed. Check your login and try again.");
      return;
    }

    await loadData();
  };

  /**
   * Admin sign-in (email and password).
   */
  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Login failed. Check email and password.");
      return;
    }

    setAuthOpen(false);
    setEmail("");
    setPassword("");
  };

  /**
   * Sign out and close any open editor.
   */
  const signOut = async () => {
    await supabase.auth.signOut();
    closeEditor();
  };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <img
          src="/logo.png"
          alt="Logo"
          width={44}
          height={44}
          style={{
            borderRadius: 12,
            border: "1px solid #e5e5e5",
            background: "white",
            objectFit: "contain",
            padding: 6,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: "8px 0 4px" }}>PLU Substitutions</h1>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Search by product name, old code, new code, or notes
          </div>
        </div>

        {!isAuthed ? (
          <button
            onClick={() => setAuthOpen(true)}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Admin login
          </button>
        ) : (
          <button
            onClick={signOut}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            Sign out
          </button>
        )}
      </div>

      {/* Live search */}
      <div style={{ marginTop: 14 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 12,
            border: "1px solid #ccc",
          }}
        />

        <div style={{ marginTop: 10, fontSize: 14, opacity: 0.7 }}>
          {loading ? "Loading..." : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* Admin actions */}
      {isAuthed ? (
        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            onClick={openAdd}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Add substitution
          </button>

          <button
            onClick={loadData}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Refresh
          </button>
        </div>
      ) : null}

      {/* Results */}
      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {results.map((r) => (
          <Card key={r.id}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{r.product_name}</div>

                <div style={{ marginTop: 6 }}>
                  Old Code: <b>{r.old_code}</b>
                </div>

                <div style={{ marginTop: 4 }}>
                  New Code: <b>{r.new_code}</b>
                </div>

                {r.notes ? <div style={{ marginTop: 8, opacity: 0.85 }}>{r.notes}</div> : null}
              </div>

              {isAuthed ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <button
                    onClick={() => openEdit(r)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteRow(r)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {/* Modals */}
      {(authOpen || editing) ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
          onClick={() => {
            if (authOpen) setAuthOpen(false);
            if (editing) closeEditor();
          }}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "white",
              borderRadius: 16,
              padding: 14,
              border: "1px solid #e5e5e5",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {authOpen ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Admin login</div>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <Field
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="username"
                  />

                  <Field
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setAuthOpen(false)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={signIn}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Sign in
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 18 }}>
                  {editing?.id ? "Edit substitution" : "Add substitution"}
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <Field
                    label="Product Name"
                    value={form.product_name}
                    onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))}
                    placeholder="e.g. Banana"
                  />

                  <Field
                    label="Old Code"
                    value={form.old_code}
                    onChange={(e) => setForm((p) => ({ ...p, old_code: e.target.value }))}
                    placeholder="e.g. 0"
                  />

                  <Field
                    label="New Code"
                    value={form.new_code}
                    onChange={(e) => setForm((p) => ({ ...p, new_code: e.target.value }))}
                    placeholder="e.g. 17"
                  />

                  <Field
                    label="Notes (optional)"
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Any extra info"
                  />
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    onClick={closeEditor}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={saveRow}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ccc",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
