import streamlit as st

from rag import ask_legal_question


st.set_page_config(page_title="Sri Lanka Legal Assistant", page_icon="⚖️")
st.title("⚖️ Sri Lanka Legal Assistant")
st.caption("General legal information based on the available Sri Lankan legal documents.")

if "messages" not in st.session_state:
    st.session_state.messages = []

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

if question := st.chat_input("Ask a general legal question"):
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Searching the available legal documents..."):
            result = ask_legal_question(question)
            st.markdown(result["answer"])
            if result["sources"]:
                st.caption("Sources: " + ", ".join(result["sources"]))
            st.session_state.messages.append(
                {"role": "assistant", "content": result["answer"]}
            )
