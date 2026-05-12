"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      const res = await fetch(`http://localhost:8000/${endpoint}`, {
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
        const errorData = await res.json().catch(() => ({}));
        const message = errorData.detail || (endpoint.includes("register")
          ? "Registration failed — username may already exist"
          : "Invalid username or password");
        setError(typeof message === "string" ? message : JSON.stringify(message));
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

        <div className="mt-8 flex flex-col gap-10 md:flex-row">
          <div className="flex-1 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Register</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => handleSubmit(e, "api/register")}>
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                name="username"
                placeholder="Username"
                required
              />
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                name="password"
                placeholder="Password"
                required
                type="password"
              />
              <button
                disabled={isLoading}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-slate-400 transition-colors"
                type="submit"
              >
                {isLoading ? "Registering..." : "Register"}
              </button>
            </form>
          </div>

          <div className="flex-1 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Login</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => handleSubmit(e, "login")}>
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                name="username"
                placeholder="Username"
                required
              />
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-green-500"
                name="password"
                placeholder="Password"
                required
                type="password"
              />
              <button
                disabled={isLoading}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-slate-400 transition-colors"
                type="submit"
              >
                {isLoading ? "Logging in..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}