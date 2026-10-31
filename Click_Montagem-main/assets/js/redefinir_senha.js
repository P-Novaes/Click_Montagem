// ================================================================
//  redefinir_senha.js — Redefinição de Senha com validação de token no servidor
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenUrl = urlParams.get('token');
    const emailUrl = urlParams.get('email');
    const emailAlvo = emailUrl;
    const tokenAlvo = tokenUrl;
    sessionStorage.removeItem('recuperacaoToken');
    history.replaceState(null, '', window.location.pathname);

    const formSection = document.getElementById('formSection');
    const tokenInvalido = document.getElementById('tokenInvalido');
    const sucessoSection = document.getElementById('sucessoSection');

    const tokenValido =
        Boolean(tokenAlvo && emailAlvo);

    if (!tokenValido) {
        if (formSection) formSection.style.display = 'none';
        if (tokenInvalido) tokenInvalido.classList.add('show');
    }

    document.querySelectorAll('.toggle-senha').forEach((btn) => {
        btn.addEventListener('click', function () {
            const target = document.getElementById(this.dataset.target);
            const icon = this.querySelector('i');
            if (!target) return;
            if (target.type === 'password') {
                target.type = 'text';
                icon?.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                target.type = 'password';
                icon?.classList.replace('fa-eye-slash', 'fa-eye');
            }
        });
    });

    const novaSenha = document.getElementById('novaSenha');
    const forcaPreenchimento = document.getElementById('forcaPreenchimento');
    const forcaTexto = document.getElementById('forcaTexto');

    if (novaSenha) {
        novaSenha.addEventListener('input', function () {
            atualizarRequisitos(this.value);
        });
    }

    function atualizarRequisitos(senha) {
        const checks = [
            { el: document.getElementById('reqMinimo'), test: senha.length >= 6 },
            { el: document.getElementById('reqMaiuscula'), test: /[A-Z]/.test(senha) },
            { el: document.getElementById('reqNumero'), test: /[0-9]/.test(senha) },
            { el: document.getElementById('reqEspecial'), test: /[^A-Za-z0-9]/.test(senha) },
        ];

        checks.forEach((c) => {
            if (!c.el) return;
            if (c.test) {
                c.el.classList.add('valido');
                c.el.querySelector('i')?.setAttribute('class', 'fas fa-check-circle');
            } else {
                c.el.classList.remove('valido');
                c.el.querySelector('i')?.setAttribute('class', 'fas fa-circle');
            }
        });

        let forca = 0;
        if (senha.length >= 6) forca++;
        if (senha.length >= 10) forca++;
        if (/[A-Z]/.test(senha)) forca++;
        if (/[0-9]/.test(senha)) forca++;
        if (/[^A-Za-z0-9]/.test(senha)) forca++;

        const cores = ['#e74c3c', '#e74c3c', '#f39c12', '#2ecc71', '#27ae60'];
        const textos = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte'];
        const idx = Math.max(0, forca - 1);

        if (forcaPreenchimento) {
            forcaPreenchimento.style.width = (Math.max(1, forca) / 5) * 100 + '%';
            forcaPreenchimento.style.background = cores[idx];
        }
        if (forcaTexto) {
            forcaTexto.textContent = textos[idx];
            forcaTexto.style.color = cores[idx];
        }
    }

    const form = document.getElementById('redefinirForm');
    const btnRedefinir = document.getElementById('btnRedefinir');
    const msgErro = document.getElementById('msgErro');
    const erroTexto = document.getElementById('erroTexto');

    function mostrarErro(msg) {
        if (erroTexto) erroTexto.textContent = msg;
        if (msgErro) {
            msgErro.classList.add('show');
            setTimeout(() => msgErro.classList.remove('show'), 5000);
        } else {
            alert(msg);
        }
    }

    if (form) {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const senha = novaSenha?.value || '';
            const confirmar = document.getElementById('confirmarSenha')?.value || '';

            if (senha.length < 6) {
                mostrarErro('A nova senha deve ter no mínimo 6 caracteres.');
                return;
            }
            if (senha !== confirmar) {
                mostrarErro('As senhas não coincidem.');
                return;
            }
            if (!emailAlvo || !tokenAlvo) {
                mostrarErro('Link de recuperação inválido. Solicite um novo link.');
                return;
            }

            const textoOriginal = btnRedefinir?.innerHTML;
            if (btnRedefinir) {
                btnRedefinir.disabled = true;
                btnRedefinir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando senha…';
            }

            try {
                await API.usuarios.redefinirSenha(emailAlvo, senha, tokenAlvo);

                sessionStorage.removeItem('recuperacaoToken');
                localStorage.removeItem('recuperacaoToken');
                if (formSection) formSection.style.display = 'none';
                if (sucessoSection) sucessoSection.classList.add('show');
            } catch (err) {
                mostrarErro(err.message || 'Erro ao redefinir senha.');
            } finally {
                if (btnRedefinir) {
                    btnRedefinir.disabled = false;
                    btnRedefinir.innerHTML = textoOriginal;
                }
            }
        });
    }
});
