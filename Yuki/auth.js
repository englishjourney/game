// auth.js - Gerencia a tela de login flutuante do Yuki
document.addEventListener("DOMContentLoaded", () => {
  const loginOverlay = document.getElementById("login-overlay");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const submitBtn = loginForm.querySelector(".login-btn");

  // 1. Verifica no Cache (localStorage) se o aluno já logou antes
  const cachedUser = localStorage.getItem("game_user");
  
  if (cachedUser) {
    // Se o usuário está no cache, oculta o modal e carrega os dados
    loginOverlay.style.display = "none";
    loadUserData(); // Essa função está no script.js
  }

  // 2. Ação do Botão Entrar
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault(); // Impede a página de recarregar
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) return;

    submitBtn.innerText = "Verificando...";
    submitBtn.disabled = true;
    loginError.style.display = "none";

    try {
      // Usa o supabaseClient (declarado no script.js) para verificar usuário e senha na tabela customizada 'users'
      const { data: user, error } = await supabaseClient
        .from("users")
        .select("id, name, username, avatar_url, serie, team")
        .eq("username", username)
        .eq("psswd", password)
        .single();

      if (error || !user) {
        throw new Error("Usuário ou senha incorretos.");
      }

      // 3. Login Válido: Salva no cache do navegador
      localStorage.setItem("game_user", JSON.stringify(user));
      
      // 4. Esconde o modal de login
      loginOverlay.style.display = "none";
      
      // 5. Atualiza a variável global do chat
      loadUserData(); 

    } catch (err) {
      console.error("Erro no login:", err);
      loginError.style.display = "block";
      loginError.innerText = "Usuário ou senha incorretos!";
    } finally {
      submitBtn.innerText = "Entrar no Chat";
      submitBtn.disabled = false;
    }
  });
});
