import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function backfillMissingUserIds() {
  console.log("Iniciando backfill de user_id nas tabelas crm_contacts e crm_messages...");

  // 1. Corrigir crm_contacts: se user_id estiver nulo, tentar associar via crm_settings (identificador ou waba)
  const { data: contacts, error: contactsErr } = await supabase
    .from('crm_contacts')
    .select('id, wa_id, user_id')
    .is('user_id', null);

  if (contactsErr) {
    console.error("Erro ao buscar contatos sem user_id:", contactsErr);
  } else if (contacts && contacts.length > 0) {
    console.log(`Encontrados ${contacts.length} contatos sem user_id.`);
    
    // Tentar buscar um user_id padrão do crm_settings se houver apenas um usuário ou usar o primeiro encontrado
    const { data: settings } = await supabase.from('crm_settings').select('user_id').limit(1).maybeSingle();
    const defaultUserId = settings?.user_id;

    if (defaultUserId) {
      for (const contact of contacts) {
        const { error: updateErr } = await supabase
          .from('crm_contacts')
          .update({ user_id: defaultUserId })
          .eq('id', contact.id);
        
        if (updateErr) console.error(`Erro ao atualizar contato ${contact.id}:`, updateErr);
      }
      console.log(`Backfill concluído para ${contacts.length} contatos.`);
    } else {
      console.warn("Nenhum user_id padrão encontrado em crm_settings para backfill.");
    }
  }

  // 2. Corrigir crm_messages: associar user_id baseado no contact_id
  const { data: messages, error: messagesErr } = await supabase
    .from('crm_messages')
    .select('id, contact_id, user_id')
    .is('user_id', null);

  if (messagesErr) {
    console.error("Erro ao buscar mensagens sem user_id:", messagesErr);
  } else if (messages && messages.length > 0) {
    console.log(`Encontradas ${messages.length} mensagens sem user_id.`);
    
    for (const msg of messages) {
      if (!msg.contact_id) continue;
      
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('user_id')
        .eq('id', msg.contact_id)
        .maybeSingle();
      
      if (contact?.user_id) {
        await supabase
          .from('crm_messages')
          .update({ user_id: contact.user_id })
          .eq('id', msg.id);
      }
    }
    console.log("Backfill de mensagens concluído.");
  }
}

await backfillMissingUserIds();
Deno.exit(0);
