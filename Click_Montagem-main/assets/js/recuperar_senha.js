// ================================================================
//  recuperar_senha.js — Recuperação de Senha conectada ao backend Express
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('recuperarForm');
    const formSection = document.getElementById('formSection');
    const sucessoSection = document.getElementById('sucessoSection');
    const emailEnviado = document.getElementById('emailEnviado');
    const reenviarLink = document.getElementById('reenviarLink');
    const msgErro = document.getElementById('msgErro');
    const erroTexto = document.getElementById('erroTexto');
    const btnEnviar = document.getElementById('btnEnviar');

    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            mostrarErro('Por favor, informe um e-mail válido.');
            return;
        }

        const textoOriginal = btnEnviar?.innerHTML;
        if (btnEnviar) {
            btnEnviar.disabled = true;
            btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando…';
        }

        try {
            const res = await API.usuarios.recuperarSenha(email);

            emailEnviado.textContent = res.mensagem;
            formSection.style.display = 'none';
            sucessoSection.classList.add('show');
        } catch (err) {
            mostrarErro(err.message || 'E-mail não encontrado em nossa base de usuários.');
        } finally {
            if (btnEnviar) {
                btnEnviar.disabled = false;
                btnEnviar.innerHTML = textoOriginal;
            }
        }
    });

    function mostrarErro(msg) {
        if (erroTexto) erroTexto.textContent = msg;
        if (msgErro) {
            msgErro.classList.add('show');
            setTimeout(() => msgErro.classList.remove('show'), 5000);
        } else {
            alert(msg);
        }
    }

    if (reenviarLink) {
        reenviarLink.addEventListener('click', function (e) {
            e.preventDefault();
            sucessoSection.classList.remove('show');
            formSection.style.display = 'block';
            const emailInp = document.getElementById('email');
            if (emailInp) {
                emailInp.value = '';
                emailInp.focus();
            }
        });
    }
});
