"use client";

import { getApiErrorMessage } from "@/lib/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>, endpoint: string) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = new URLSearchParams();
    formData.forEach((value, key) => {
      data.append(key, value as string);
    });

    try {
      const res = await fetch(`${API_BASE_URL}/${endpoint.replace(/^\/+/, "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: data.toString(),
        credentials: "include",
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const fallback = endpoint.includes("register")
          ? "Registration failed — username may already exist"
          : "Invalid username or password";
        setError(await getApiErrorMessage(res, fallback));
      }
    } catch (err) {
      setError("Unable to connect to the server. Please check if the backend is running.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-8 py-8 sm:px-10 lg:px-16 xl:px-20 bg-slate-50">
      <section className="mx-auto max-w-7xl">
        <div className="border-b border-slate-200 pb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-green-600">Smart Watering</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Plant Pal</h1>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mx-auto mt-12 w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          {mode === "login" ? (
            <>
              <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
              <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => handleSubmit(e, "login")}>
                <input
                  className="rounded border border-slate-300 px-4 py-3 text-base text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                  name="username"
                  placeholder="Username"
                  required
                />
                <input
                  className="rounded border border-slate-300 px-4 py-3 text-base text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                  name="password"
                  placeholder="Password"
                  required
                  type="password"
                />
                <button
                  disabled={isLoading}
                  className="rounded bg-green-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-green-700 disabled:bg-slate-400"
                  type="submit"
                >
                  {isLoading ? "Logging in..." : "Login"}
                </button>
              </form>
              <button
                className="mt-4 w-full rounded border border-green-200 bg-white px-4 py-3 text-base font-medium text-green-700 transition-colors hover:bg-green-50"
                onClick={() => {
                  setError(null);
                  setMode("register");
                }}
                type="button"
              >
                Register
              </button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-slate-900">Register</h2>
              <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => handleSubmit(e, "api/register")}>
                <input
                  className="rounded border border-slate-300 px-4 py-3 text-base text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                  name="username"
                  placeholder="Username"
                  required
                />
                <input
                  className="rounded border border-slate-300 px-4 py-3 text-base text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                  name="password"
                  placeholder="Password"
                  required
                  type="password"
                />
                <button
                  disabled={isLoading}
                  className="rounded bg-green-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-green-700 disabled:bg-slate-400"
                  type="submit"
                >
                  {isLoading ? "Registering..." : "Register"}
                </button>
              </form>
              <button
                className="mt-4 w-full rounded border border-slate-200 bg-white px-4 py-3 text-base font-medium text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => {
                  setError(null);
                  setMode("login");
                }}
                type="button"
              >
                Back to Login
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
