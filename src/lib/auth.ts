import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { queryOne } from "./db";
import type { Role } from "./constants";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await queryOne<{
          user_id: number; full_name: string; email: string; password_hash: string; role: Role;
        }>(
          "SELECT user_id, full_name, email, password_hash, role FROM users WHERE email = lower($1)",
          [credentials.email.trim()],
        );
        if (!user || !(await bcrypt.compare(credentials.password, user.password_hash))) return null;
        return { id: String(user.user_id), name: user.full_name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = Number(user.id);
        token.role = (user as unknown as { role: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { ...session.user, id: token.uid as number, role: token.role as Role };
      return session;
    },
  },
};

export type SessionUser = { id: number; name?: string | null; email?: string | null; role: Role };

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser | undefined) ?? null;
}
