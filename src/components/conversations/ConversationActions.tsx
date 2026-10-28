"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  /** Com quem é o fio, para que o aviso diga que vai ser apagado. */
  name: string;
  messageCount: number;
}

/**
 * Menu do fio aberto. Hoje só apagar, que é destrutivo e por isso pede
 * confirmação escrita em vez de um `confirm()` do navegador. Só um admin vê;
 * o servidor mesmo assim volta a checar.
 */
export function ConversationActions({ conversationId, name, messageCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo eliminar la conversacion");
        return;
      }
      toast.success(
        body.messages === 1
          ? "Conversacion eliminada (1 mensaje)"
          : `Conversacion eliminada (${body.messages ?? 0} mensajes)`
      );
      setOpen(false);
      router.push("/conversations");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              aria-label="Opciones de la conversacion"
            />
          }
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => setOpen(true)}
            className="text-destructive cursor-pointer"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar conversacion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar la conversacion con {name}?</DialogTitle>
            <DialogDescription>
              Se borran {messageCount === 1 ? "1 mensaje" : `${messageCount} mensajes`} de
              este hilo. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            El contacto, sus operaciones y sus documentos <strong>no</strong> se tocan. Si
            vuelve a escribir, se abre un hilo nuevo.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={remove}
              disabled={deleting}
              className="cursor-pointer"
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
