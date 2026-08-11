// supabaseClient.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Substitua pelas suas credenciais reais do Supabase
const supabaseUrl = 'https://rmsmamzutvxugdbiqsrz.supabase.co';
const supabaseKey = 'sb_publishable_hMNCps2v2Odflpq9zDt_dw_Cgb_Jcxx';

// Inicializa e exporta o cliente para ser usado em outros arquivos
export const supabase = createClient(supabaseUrl, supabaseKey);
