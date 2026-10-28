"use client";

import { useEffect, useState } from "react";
import { UserCircle2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "asesor";
  active: boolean;
}

const NONE = "__none__";

function label(m: Member) {
  return m.name?.trim() || m.email.split("@")[0];
}

/** Lista da equipe + quem sou. Compartilha-se entre todos os seletores da página. */
let cache: Promise<{ members: Member[]; me: Member | null }> | null = null;
function loadTeam() {
  if (!cache) {
    cache = Promise.all([
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team/me").then((r) => (r.ok ? r.json() : { member: null })),
    ]).then(([members, me]) => ({ members, me: me.member }));
    // O cache dura o que dura a navegação; uma mudança na equipe se vê ao recarregar.
    setTimeout(() => (cache = null), 60_000);
  }
  return cache;
}

interface Props {
  /** Se vier, a mudança se salva sozinha (PUT /api/contacts/:id). Se não, é controlado. */
  contactId?: string;
  value: string | null;
  onChange?: (ownerId: string | null) => void;
  className?: string;
  /** Variante compacta para painéis laterais. */
  compact?: boolean;
}

/**
 * Seletor de proprietário. O admin muda; o assessor só vê o nome. Se o
 * contato tem id, salva na hora e dispara a automação no servidor.
 */
export function OwnerSelect({ contactId, value, onChange, className, compact }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [current, setCurrent] = useState<string | null>(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    loadTeam().then(({ members, me }) => {
      if (!alive) return;
      setMembers(members);
      setMe(me);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setCurrent(value);
  }, [value]);

  const isAdmin = me?.role === "admin";
  const selectable = members.filter((m) => m.active || m.id === current);
  const owner = members.find((m) => m.id === current) ?? null;

  const change = async (next: string | null) => {
    setCurrent(next);
    onChange?.(next);
    if (!contactId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "No se pudo asignar");
        setCurrent(value);
        return;
      }
      const m = members.find((x) => x.id === next);
      toast.success(m ? `Asignado a ${label(m)}` : "Propietario quitado");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className={cn(!owner && "text-muted-foreground")}>
          {owner ? label(owner) : "Sin asesor asignado"}
        </span>
      </div>
    );
  }

  return (
    <Select
      value={current ?? NONE}
      items={[
        { value: NONE, label: "Sin asesor asignado" },
        ...selectable.map((m) => ({ value: m.id, label: label(m) + (m.active ? "" : " (inactivo)") })),
      ]}
      onValueChange={(v) => v && change(v === NONE ? null : v)}
      disabled={saving}
    >
      <SelectTrigger className={cn("cursor-pointer", compact && "h-8 text-xs", className)}>
        <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
        <SelectValue placeholder="Sin asesor asignado" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Sin asesor asignado</SelectItem>
        {selectable.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {label(m)}
            {!m.active ? " (inactivo)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
