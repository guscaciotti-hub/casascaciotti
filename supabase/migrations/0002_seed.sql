-- Casa Scaciotti — seed das categorias iniciais
-- Idempotente: pode rodar quantas vezes quiser.

insert into public.categories (name, color, icon, is_essential) values
  ('Escola',                 '#2563eb', 'graduation-cap',  true),
  ('Mercado',                '#16a34a', 'shopping-cart',   true),
  ('Delivery/iFood',         '#ea580c', 'utensils',        false),
  ('Saúde',                  '#0891b2', 'heart-pulse',     true),
  ('Farmácia',               '#0d9488', 'pill',            true),
  ('Transporte/Combustível', '#7c3aed', 'fuel',            true),
  ('Assinaturas',            '#db2777', 'repeat',          false),
  ('Casa/Utilidades',        '#65a30d', 'house',           true),
  ('Vestuário',              '#c026d3', 'shirt',           false),
  ('Lazer',                  '#f59e0b', 'party-popper',    false),
  ('Pets',                   '#b45309', 'paw-print',       false),
  ('Trabalho/Ferramentas',   '#475569', 'briefcase',       false),
  ('Não identificado',       '#94a3b8', 'circle-help',     false)
on conflict (name) do nothing;
