// Ordem de progressão do pedido no trecho da entrega. Um webhook só pode
// avançar o status — nunca rebaixar (aviso atrasado de "coletado" chegando
// depois de "entregue") nem mexer em pedido cancelado/concluído.
export const DELIVERY_PROGRESSION = [
  'confirmed',
  'preparing',
  'awaiting_dispatch',
  'shipped',
  'in_delivery',
  'delivered',
];

/** True se `next` avança o pedido que está em `current`. */
export function advancesDelivery(
  current: string,
  next: string | null,
): boolean {
  if (!next) return false;
  const atual = DELIVERY_PROGRESSION.indexOf(current);
  const novo = DELIVERY_PROGRESSION.indexOf(next);
  return atual !== -1 && novo > atual;
}
