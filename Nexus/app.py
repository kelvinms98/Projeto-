from flask import Flask, render_template, request, redirect, url_for, session
import pymysql

# O 'app' precisa ser criado obrigatoriamente antes de qualquer uso de @app.route
app = Flask(__name__)
app.secret_key = 'chave_secreta_super_segura'

def criar_conexao():
    return pymysql.connect(
        host='localhost',
        user='root',
        password='',
        database='nexus',
        cursorclass=pymysql.cursors.DictCursor
    )

@app.route('/')
def index():
    return "Servidor rodando e conectado ao banco NEXUS do Coordenador!"

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        
        if not email:
            return "Por favor, preencha o campo de e-mail."
        
        conexao = criar_conexao()
        with conexao.cursor() as cursor:
            cursor.execute("SELECT * FROM funcionarios WHERE email = %s", (email,))
            funcionario = cursor.fetchone()
            
            funcionarios = []
            if funcionario and funcionario['cargo'] == 'Coordenador TI':
                cursor.execute("SELECT * FROM funcionarios")
                funcionarios = cursor.fetchall()
                
        conexao.close()
        
        if funcionario:
            session['id_funcionario'] = funcionario['id_funcionario']
            session['nome'] = funcionario['nome']
            session['cargo'] = funcionario['cargo']
            
            if funcionario['cargo'] == 'Coordenador TI':
                return render_template('dashboard.html', nome=funcionario['nome'], funcionarios=funcionarios)
            else:
                return f"Login realizado com sucesso! Bem-vindo, {funcionario['nome']} ({funcionario['cargo']})"
        else:
            return "E-mail não encontrado nos registros de funcionários."
            
    return render_template('login.html')

if __name__ == '__main__':
    app.run(debug=True)