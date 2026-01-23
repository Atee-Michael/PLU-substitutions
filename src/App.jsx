import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

/**
 * Simple card wrapper for consistent styling.
 */
function Card({ children }) {
  return <div className="card">{children}</div>;
}

/**
 * Reusable input field with label.
 */
function Field({ label, className, ...props }) {
  const inputClassName = ["input", className].filter(Boolean).join(" ");
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        {...props}
        className={inputClassName}
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
  const [errorMsg, setErrorMsg] = useState("");

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
   * Username shortcuts for managers.
   * This lets managers type a simple username in the Email field.
   *
   * Notes:
   * - Keep keys lowercase
   * - Values must be valid Supabase Auth emails that already exist
   */
  const USERNAME_TO_EMAIL = {
    substitutions: "teamcharlton@gmail.com",
  };

  /**
   * Resolves what the user typed in the login field.
   * - If it includes "@", treat it as an email and use it as-is
   * - Otherwise treat it as a username shortcut and map it to an email
   *
   * Returns:
   * - { ok: true, email: string } when resolved
   * - { ok: false, message: string } when unknown/invalid
   */
  const resolveLoginToEmail = (input) => {
    const raw = (input || "").trim();
    if (!raw) return { ok: false, message: "Please enter your email or username." };

    // If it looks like an email, use it directly
    if (raw.includes("@")) return { ok: true, email: raw };

    // Otherwise treat as username shortcut (case-insensitive)
    const key = raw.toLowerCase();
    const mapped = USERNAME_TO_EMAIL[key];

    if (!mapped) {
      return {
        ok: false,
        message: "Unknown username. Use your email address, or ask the admin to add your username.",
      };
    }

    return { ok: true, email: mapped };
  };

  /**
   * Reloads substitutions from Supabase.
   * Used by the Refresh button and after mutations (save/delete).
   */
  const loadData = async () => {
    setLoading(true);
    setErrorMsg("");

    const { data, error } = await supabase
      .from("code_substitutions")
      .select("id, product_name, old_code, new_code, notes")
      .order("product_name", { ascending: true });

    if (error) {
      setErrorMsg(error.message || "Failed to load data.");
    } else if (Array.isArray(data)) {
      setRows(data);
    }
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
        if (error) {
          setErrorMsg(error.message || "Failed to load data.");
        } else if (Array.isArray(data)) {
          setRows(data);
        }
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
    setErrorMsg("");
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

    const dupName = rows.find((r) => {
      if (editing?.id && r.id === editing.id) return false;
      return r.product_name?.toLowerCase() === payload.product_name.toLowerCase();
    });

    const dupNewCode = rows.find((r) => {
      if (editing?.id && r.id === editing.id) return false;
      return r.new_code?.toLowerCase() === payload.new_code.toLowerCase();
    });

    if (dupName || dupNewCode) {
      const msg = "Duplicate: Product Name and New Code already exists.";
      setErrorMsg(msg);
      alert(msg);
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
      setErrorMsg(result.error.message || "Save failed. Check your login and try again.");
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
    setErrorMsg("");
    if (!isAuthed) {
      alert("You must be logged in to delete.");
      return;
    }

    const ok = confirm(`Delete "${row.product_name}" (Old ${row.old_code})?`);
    if (!ok) return;

    const { error } = await supabase.from("code_substitutions").delete().eq("id", row.id);

    if (error) {
      setErrorMsg(error.message || "Delete failed. Check your login and try again.");
      alert("Delete failed. Check your login and try again.");
      return;
    }

    await loadData();
  };

  /**
   * Admin sign-in (email and password).
   */
  const signIn = async () => {
    const resolved = resolveLoginToEmail(email);

    if (!resolved.ok) {
      alert(resolved.message);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: resolved.email,
      password,
    });

    if (error) {
      alert("Login failed. Check email or username and password.");
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
    <div className="app-shell">
      {/* Header */}
      <div className="app-header glass">
        <img
          src="/logo.png"
          alt="Logo"
          width={44}
          height={44}
          className="logo"
        />

        <div className="header-text">
          <h1>Product Code Substitutions</h1>
          <div className="subhead">
            Search by product name, old code, new code, or notes
          </div>
        </div>

        {!isAuthed ? (
          <button
            onClick={() => setAuthOpen(true)}
            className="btn btn-ghost"
          >
            Admin login
          </button>
        ) : (
          <button
            onClick={signOut}
            className="btn btn-ghost"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Live search */}
      <div className="search-panel glass">
        {errorMsg ? (
          <div role="alert" className="alert">
            {errorMsg}
          </div>
        ) : null}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search"
          className="input input-search"
        />

        <div className="result-count">
          {loading ? "Loading..." : `${results.length} result${results.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {/* Admin actions */}
      {isAuthed ? (
        <div className="action-row">
          <button
            onClick={openAdd}
            className="btn btn-primary"
          >
            Add substitution
          </button>

          <button
            onClick={loadData}
            className="btn btn-ghost"
          >
            Refresh
          </button>
        </div>
      ) : null}

      {/* Results */}
      <div className="results">
        {results.map((r) => (
          <Card key={r.id}>
            <div className="result-row">
              <div className="result-main">
                <div className="result-title">{r.product_name}</div>

                <div className="code-row">
                  Old Code: <span className="code-pill">{r.old_code}</span>
                </div>

                <div className="code-row">
                  New Code: <span className="code-pill code-pill-new">{r.new_code}</span>
                </div>

                {r.notes ? <div className="result-notes">{r.notes}</div> : null}
              </div>

              {isAuthed ? (
                <div className="result-actions">
                  <button
                    onClick={() => openEdit(r)}
                    className="btn btn-ghost btn-compact"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteRow(r)}
                    className="btn btn-ghost btn-compact"
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
          className="modal-backdrop"
          onClick={() => {
            if (authOpen) setAuthOpen(false);
            if (editing) closeEditor();
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {authOpen ? (
              <>
                <div className="modal-title">Manager Login</div>

                <div className="modal-body">
                  <Field
                    label="Email or Username"
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

                <div className="modal-actions">
                  <button
                    onClick={() => setAuthOpen(false)}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={signIn}
                    className="btn btn-primary"
                  >
                    Sign in
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title">
                  {editing?.id ? "Edit substitution" : "Add substitution"}
                </div>

                <div className="modal-body">
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

                <div className="modal-actions">
                  <button
                    onClick={closeEditor}
                    className="btn btn-ghost"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={saveRow}
                    className="btn btn-primary"
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
