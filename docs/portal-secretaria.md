# Ativação do portal de pré-matrícula

O site está no GitHub Pages. `public/enrollment-config.json` contém apenas a URL do projeto, a chave publicável e o controle de ativação. Chaves secretas pertencem ao ambiente do Supabase.

1. Aplique as migrações na ordem em que aparecem em `supabase/migrations`. No projeto hospedado da escola, confirme as migrações registradas antes de aplicar.
2. Em Authentication, configure SMTP próprio, o remetente e os limites de envio da escola. Use `{{ .ConfirmationURL }}` nos modelos de confirmação de cadastro e recuperação de senha da Família e da Secretaria. A Secretaria aceita e-mail e senha e oferece acesso alternativo por e-mail. O modelo desse acesso alternativo aceita o link `{{ .ConfirmationURL }}` ou o código `{{ .Token }}`. Autorize os endereços exatos do portal da Família e da Secretaria em Authentication → URL Configuration. Os e-mails das famílias precisam ser verificados antes de qualquer envio.
3. Autorize apenas os membros designados pela creche após eles confirmarem o e-mail. Execute no SQL Editor com o e-mail confirmado da pessoa autorizada:

   ```sql
   insert into enrollment_private.staff (user_id)
   select id from auth.users
   where lower(email) = lower('<e-mail autorizado pela escola>') and email_confirmed_at is not null
   on conflict do nothing;
   ```

   A retirada de uma conta dessa tabela remove seu acesso aos registros da secretaria. A equipe entra em `portal.html?area=secretaria`; as famílias entram em `portal.html`.

4. Configure o remetente e os segredos `RESEND_API_KEY`, `ENROLLMENT_EMAIL_FROM`, `ENROLLMENT_PORTAL_URL` e `ENROLLMENT_NOTIFY_TOKEN` na Edge Function `enrollment-status-email`. O agendamento no Supabase Cron deve chamar a função via POST a cada 5 minutos, usando o mesmo token no cabeçalho `x-enrollment-notify-token`. Guarde o token do agendamento no Supabase Vault. O aviso indica que existe uma atualização e direciona ao portal. Dados da criança e a decisão ficam na área autenticada.
5. Defina `enabled` como `true` em `public/enrollment-config.json` depois que o login estiver configurado. Confira com duas contas fictícias de família e uma conta autorizada da secretaria o envio, a separação das fichas, o acompanhamento, a aprovação e a impressão dos dois tipos de relatório.

## Dados e acesso

O envio online armazena nome e nascimento da criança, turno e ano letivo, dados de contato do responsável e histórico da solicitação. Dados de saúde, endereço, CEP e foto 3×4 ficam no PDF local. O PDF continua disponível na ficha preenchida, mesmo com o portal desativado.

A secretaria acompanha o total de pré-matrículas em andamento, matrículas confirmadas e o total de solicitações. A idade do relatório é calculada na data da consulta. O resumo é agregado, e a lista nominal imprimível contém apenas nome, idade, turno e situação.

Antes de receber cadastros reais, a escola deve informar às famílias a finalidade do tratamento, o prazo de guarda e o contato para solicitações relativas aos dados. Ao excluir uma conta com solicitações registradas, trate primeiro os cadastros e o histórico conforme a política de retenção da escola.
